"""Export matchengine data as noble-frontend IngestBatches.

Produces an array of IngestBatch (shared/ingest.ts contract) the noble app
ingests directly:

    cd ../../frontend
    npm run ingest -- --file=data/matchengine-batch.json --workspace=live

Mapping:
    companies — the demo-lane companies (relationship: prospect)
    interests — investment fields become research "needs" (topics from the
                field text) so noble's Find-faculty matcher ranks professors
    signals   — evidence + ledger events; market/earnings map to
                company-focus-change (timing-only), PSU-engagement facts to
                funding-announcement, everything else to company-announcement

Stdlib only; read-only against the SQLite files.
"""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from export_snapshot import DISPLAY_NAMES, LANES, TICKER_NOTE, open_db  # noqa: E402

STOP = {"the", "and", "for", "with", "of", "in", "to", "on", "a", "an", "at", "is", "are", "be", "by", "from", "that", "this", "it", "or"}


def tokens(text: str) -> list[str]:
    return [t for t in re.split(r"[^a-z0-9]+", (text or "").lower()) if len(t) > 2 and t not in STOP]


def signal_kind(source: str, kind: str, psu_engaged: bool) -> str:
    if psu_engaged or source == "psu":
        return "funding-announcement"
    if kind in {"week_move", "momentum_6mo", "fresh_high", "fresh_low", "earnings_soon", "post"} or source == "market":
        return "company-focus-change"
    return "company-announcement"


def suggested_action(kind: str) -> str:
    if kind == "company-focus-change":
        return "Timing signal only — says now/not-now, never research need. A person decides."
    return "Read the source and decide next step. Nothing is auto-sent."


def collect(args) -> list[dict]:
    companies_out: list[dict] = []
    interests_out: list[dict] = []
    signals_out: list[dict] = []
    today = date.today().isoformat()

    for db_path in [args.db] + sorted(p.as_posix() for p in Path(args.demo_dir).glob("*.db")):
        try:
            conn = open_db(db_path)
        except sqlite3.Error:
            continue
        try:
            for row in conn.execute("SELECT company_id, name FROM company"):
                cid = row["company_id"]
                if cid not in LANES:
                    continue  # demo companies only
                name = DISPLAY_NAMES.get(cid, row["name"])
                score = conn.execute(
                    """SELECT s.final, s.capped FROM opportunity o
                       JOIN score s ON s.opportunity_id=o.opportunity_id
                       WHERE o.company_id=? ORDER BY s.rowid DESC LIMIT 1""",
                    (cid,),
                ).fetchone()
                fields = [
                    r["field"]
                    for r in conn.execute(
                        """SELECT field FROM investment_field WHERE company_id=?
                           ORDER BY latest_date DESC LIMIT 6""",
                        (cid,),
                    )
                ]
                companies_out.append({
                    "id": f"matchengine-{cid}",
                    "externalIds": {"matchengine": cid},
                    "name": name,
                    "industry": TICKER_NOTE.get(cid, "corporate research partner"),
                    "description": (
                        f"matchengine dossier: score {score['final']}"
                        + (" (capped ≤6.0)" if score and score["capped"] else "")
                        + " — verified-evidence pipeline; catalysts are timing-only."
                        if score
                        else "matchengine dossier — collection in progress."
                    ),
                    "objectives": fields[:3],
                    "relationship": "prospect",
                })
                for f in fields:
                    slug = re.sub(r"[^a-z0-9]+", "-", f.lower())[:60].strip("-")
                    interests_out.append({
                        "id": f"int-matchengine-{cid}-{slug}",
                        "externalIds": {"matchengine": f"{cid}:{slug}"},
                        "company": f"matchengine-{cid}",
                        "pathway": "research",
                        "title": f,
                        "description": f"investment field synthesized from verified matchengine evidence ({today}).",
                        "topics": tokens(f)[:8],
                        "status": "open",
                    })
                for ev in conn.execute(
                    """SELECT source, source_url, excerpt, event_date, implication,
                              kind, psu_engaged
                       FROM evidence
                       WHERE company_id=? AND verified=1 AND stale=0
                         AND event_date IS NOT NULL
                       ORDER BY event_date DESC LIMIT 24""",
                    (cid,),
                ):
                    k = signal_kind(ev["source"], ev["kind"], bool(ev["psu_engaged"]))
                    signals_out.append({
                        "externalIds": {"matchengine": ev["source_url"][:120]},
                        "kind": k,
                        "title": ev["excerpt"][:300],
                        "detail": (ev["implication"] or "")[:300],
                        "date": ev["event_date"],
                        "companies": [{"id": f"matchengine-{cid}"}],
                        "suggestedAction": suggested_action(k),
                        "url": ev["source_url"],
                    })
                for s in conn.execute(
                    """SELECT kind, text, event_date FROM signal_events
                       WHERE company_id=? AND event_date IS NOT NULL
                       ORDER BY event_date DESC LIMIT 50""",
                    (cid,),
                ):
                    k = signal_kind("market", s["kind"], False)
                    signals_out.append({
                        "kind": k,
                        "title": s["text"][:300],
                        "detail": suggested_action(k),
                        "date": s["event_date"],
                        "companies": [{"id": f"matchengine-{cid}"}],
                        "suggestedAction": suggested_action(k),
                    })
        finally:
            conn.close()

    src = {"sourceId": "matchengine", "label": "matchengine live collection (nittany-ai)"}
    return [
        {"entity": "companies", "source": src, "records": companies_out},
        {"entity": "interests", "source": src, "records": interests_out},
        {"entity": "signals", "source": src, "records": signals_out, "options": {"emitSignals": True}},
    ]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", required=True)
    ap.add_argument("--demo-dir", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    batches = collect(args)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(batches, indent=1))
    print(f"wrote {out}: {[(b['entity'], len(b['records'])) for b in batches]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
