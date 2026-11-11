"""Export matchengine data -> demo-dashboard/public/data/snapshot.json.

Reads the main matchengine DB plus the per-company demo DBs under runs/demo/,
merges them (companies are disjoint; evidence is keyed by event_hash), and
emits one JSON snapshot the dashboard loads statically.

Usage (from the demo-dashboard root, python stdlib only):
    python -I scripts/export_snapshot.py \
        --db "<nittany-ai>/runs/matchengine.db" \
        --demo-dir "<nittany-ai>/runs/demo" \
        --out public/data/snapshot.json

Read-only against the DBs; never writes the engine's data.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
from datetime import date, datetime, timezone
from pathlib import Path

# ---------------------------------------------------------------------------
# Momentum vocabulary — mirrors nittany-ai src/matchengine/signals.py exactly
# so the dashboard's verdict words never drift from the engine's.
_EXPANDING_KINDS = {"hire", "title_change", "reshuffle"}
_PULLING_KINDS = {"possibly_departed"}
_PRESENCE_KINDS = {"post", "earnings_soon"}
_UP = {"up", "high"}
_DOWN = {"down", "low"}


def classify(kind: str, direction: str | None) -> str:
    """One event's (kind, direction) -> expanding | pulling_back | presence."""
    if kind in _PULLING_KINDS:
        return "pulling_back"
    if kind in _EXPANDING_KINDS:
        return "expanding"
    if direction in _DOWN:
        return "pulling_back"
    if direction in _UP:
        return "expanding"
    return "presence"


def momentum_read(rows: list[dict], window_days: int = 7, today: date | None = None) -> dict:
    """Deterministic window read: presence never votes (engine rule)."""
    today = today or date.today()
    window = [
        r for r in rows
        if (d := _parse_date(r.get("event_date"))) and (today - d).days <= window_days
    ]
    for r in window:
        r["direction"] = classify(r.get("kind", ""), r.get("direction"))
    expanding = sum(1 for r in window if r["direction"] == "expanding")
    pulling = sum(1 for r in window if r["direction"] == "pulling_back")
    presence = sum(1 for r in window if r["direction"] == "presence")
    if expanding and pulling:
        direction = "mixed"
    elif expanding:
        direction = "expanding"
    elif pulling:
        direction = "pulling_back"
    else:
        direction = "quiet"
    return {
        "direction": direction,
        "window_rows": len(window),
        "by_class": {"expanding": expanding, "pulling_back": pulling, "presence": presence},
    }


def _parse_date(raw: object) -> date | None:
    try:
        return date.fromisoformat(str(raw or "").strip()[:10])
    except (ValueError, TypeError):
        return None


# ---------------------------------------------------------------------------
# Stakeholder lanes from the OSVPR meeting brief. Cross-lane ownership is
# UNCONFIRMED per the brief — surfaced as a question, not resolved here.
LANES = {
    "lockheed-martin": "don",
    "pratt-whitney": "don",
    "3m": "don",
    "deloitte": "brian",
    "nvidia": "brian",
    "ibm": "brian",
}
CROSS_LANE = ["3m"]

# Filings/market ride a parent's ticker (Pratt & Whitney is an RTX subsidiary).
TICKER_NOTE = {"pratt-whitney": "RTX Corporation (P&W is its subsidiary)"}

# Display names for company rows whose stored name is a slug (the store
# writes company_id as name at ensure time). PSU/OpenAlex aliases are the
# source of truth when present; this map covers the demo roster.
DISPLAY_NAMES = {
    "3m": "3M",
    "ibm": "IBM",
    "nvidia": "NVIDIA",
    "deloitte": "Deloitte",
    "lockheed-martin": "Lockheed Martin",
    "pratt-whitney": "Pratt & Whitney",
    "corning": "Corning",
    "bloom-energy": "Bloom Energy",
    "msft": "Microsoft",
    "googl": "Google",
    "aapl": "Apple",
    "tsla": "Tesla",
    "xom": "ExxonMobil",
    "amazon": "Amazon",
    "air-products": "Air Products",
    "ge-vernova": "GE Vernova",
    "deere": "Deere & Company",
    "f": "Ford",
    "gm": "General Motors",
    "cat": "Caterpillar",
    "intc": "Intel",
}


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--db", required=True, help="main matchengine.db path")
    p.add_argument("--demo-dir", required=True, help="dir holding per-company demo DBs")
    p.add_argument("--out", required=True, help="output JSON path")
    p.add_argument("--evidence-per-company", type=int, default=24)
    return p.parse_args()


def open_db(path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(f"file:{Path(path).as_posix()}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def load_company(conn: sqlite3.Connection, company_id: str, db_path: str,
                 ev_limit: int) -> dict | None:
    row = conn.execute(
        "SELECT company_id, name FROM company WHERE company_id=?", (company_id,)
    ).fetchone()
    if not row:
        return None

    counts = conn.execute(
        "SELECT COUNT(*) total, SUM(verified) verified FROM evidence WHERE company_id=?",
        (company_id,),
    ).fetchone()

    score_row = conn.execute(
        """SELECT s.dims, s.final, s.capped, s.dissent
           FROM opportunity o JOIN score s ON s.opportunity_id=o.opportunity_id
           WHERE o.company_id=? ORDER BY s.rowid DESC LIMIT 1""",
        (company_id,),
    ).fetchone()

    out: dict = {
        "company_id": company_id,
        "name": DISPLAY_NAMES.get(company_id, row["name"]),
        "lane": LANES.get(company_id, "unassigned"),
        "cross_lane": company_id in CROSS_LANE,
        "ticker_note": TICKER_NOTE.get(company_id),
        "db_path": db_path,
        "evidence": {"total": int(counts["total"] or 0),
                     "verified": int(counts["verified"] or 0)},
        "signals": [],
        "investment_fields": [],
        "alumni": [],
        "score": None,
        "top_evidence": [],
    }

    if score_row:
        try:
            dims = json.loads(score_row["dims"] or "{}")
        except json.JSONDecodeError:
            dims = {}
        out["score"] = {
            "final": score_row["final"],
            "capped": bool(score_row["capped"]),
            "dims": dims,
            "dissent": score_row["dissent"] or "",
        }

    out["signals"] = [
        {
            "kind": r["kind"],
            "direction": classify(r["kind"], r["direction"]),
            "text": r["text"],
            "event_date": r["event_date"],
            "source_url": r["source_url"],
        }
        for r in conn.execute(
            """SELECT kind, direction, text, event_date, source_url
               FROM signal_events WHERE company_id=? ORDER BY event_date DESC LIMIT 50""",
            (company_id,),
        )
    ]
    out["momentum"] = momentum_read(out["signals"])

    out["investment_fields"] = [
        {
            "field": r["field"],
            "spend_note": r["spend_note"],
            "latest_date": r["latest_date"],
            "evidence_ids": json.loads(r["evidence_ids"] or "[]"),
        }
        for r in conn.execute(
            """SELECT field, spend_note, latest_date, evidence_ids
               FROM investment_field WHERE company_id=? ORDER BY latest_date DESC""",
            (company_id,),
        )
    ]

    out["alumni"] = [
        {
            "name": r["name"],
            "role": r["role"],
            "psu_links": json.loads(r["psu_links"] or "[]"),
            "relevance": r["relevance"],
            "route": r["route"],
            "verified": bool(r["verified"]),
        }
        for r in conn.execute(
            """SELECT name, role, psu_links, relevance, route, verified
               FROM alumnus WHERE company_id=?""",
            (company_id,),
        )
    ]

    out["top_evidence"] = top_evidence(conn, company_id, ev_limit)
    return out


def top_evidence(conn: sqlite3.Connection, company_id: str, limit: int) -> list[dict]:
    """Evidence surfaced on the Signals wall.

    Default heuristic: verified-only, non-stale, freshest event_date first.
    Quarantined rows never reach the wall (they remain in the DB; their
    existence shows up as the gap between evidence.total and verified).
    """
    rows = conn.execute(
        """SELECT source, source_url, excerpt, published, event_date, implication,
                  uncertainty, kind, stale, psu_engaged
           FROM evidence WHERE company_id=? AND verified=1 AND stale=0
           ORDER BY event_date DESC LIMIT ?""",
        (company_id, limit),
    ).fetchall()
    return [
        {
            "source": r["source"],
            "source_url": r["source_url"],
            "excerpt": r["excerpt"],
            "published": r["published"],
            "event_date": r["event_date"],
            "implication": r["implication"],
            "uncertainty": r["uncertainty"],
            "kind": r["kind"],
            "verified": True,
            "stale": bool(r["stale"]),
            "psu_engaged": bool(r["psu_engaged"]),
        }
        for r in rows
    ]


def main() -> int:
    args = parse_args()
    companies: dict[str, dict] = {}
    for db in [args.db] + sorted(p.as_posix() for p in Path(args.demo_dir).glob("*.db")):
        try:
            conn = open_db(db)
        except sqlite3.Error as exc:
            print(f"skip {db}: {exc}")
            continue
        try:
            for row in conn.execute("SELECT company_id FROM company"):
                if row["company_id"] not in companies:
                    out = load_company(conn, row["company_id"], db, args.evidence_per_company)
                    if out:
                        companies[out["company_id"]] = out
        finally:
            conn.close()

    snapshot = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "note": "Export of the matchengine verified-evidence pipeline. Catalyst "
                "signals are timing-only and never research-need evidence; "
                "scores rank opportunities 1-10 — never a probability of funding.",
        "totals": {
            "companies": len(companies),
            "evidence_total": sum(c["evidence"]["total"] for c in companies.values()),
            "evidence_verified": sum(c["evidence"]["verified"] for c in companies.values()),
        },
        "companies": sorted(companies.values(), key=lambda c: c["name"]),
    }

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(snapshot, indent=1))
    print(f"wrote {out_path}: {len(companies)} companies, "
          f"{snapshot['totals']['evidence_verified']} verified evidence rows")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
