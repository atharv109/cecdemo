"""Match company investment fields against PSU faculty researchers.

Reads public/data/snapshot.json (from export_snapshot.py) and a faculty list,
then for each company x investment field scores every researcher by token
overlap between the field text and the researcher's areas/unit, and emits
band-scored results per the fime_matching band scale:

    strong >= 75, moderate >= 50, weak >= 40, else insufficient.

Faculty file default is the repo's synthetic researchers.json — matches made
from it carry synthetic_data: true and the UI must label them honestly.

Usage:
    python -I scripts/match_faculty.py \
        --faculty "<path to faculty .json or .jsonl>" \
        --snapshot public/data/snapshot.json --out public/data/matches.json

Faculty file format: JSON array (or JSONL) of
    {display_name, unit, research_areas: string[], profile_url?}
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

BANDS = ((75, "strong"), (50, "moderate"), (40, "weak"))
STOP = {
    "the", "and", "for", "with", "of", "in", "to", "on", "a", "an", "at", "is",
    "are", "be", "by", "from", "as", "that", "this", "it", "or", "s",
}


def tokens(text: str) -> list[str]:
    return [
        t for t in re.split(r"[^a-z0-9]+", (text or "").lower())
        if len(t) > 2 and t not in STOP
    ]


def load_faculty(path: Path) -> tuple[list[dict], bool]:
    raw = path.read_text(encoding="utf-8")
    if path.suffix == ".jsonl" or raw.lstrip().startswith("["):
        entries = json.loads(raw) if raw.lstrip().startswith("[") else [
            json.loads(line) for line in raw.splitlines() if line.strip()
        ]
    else:
        entries = json.loads(raw)
    out = []
    synthetic = False
    for e in entries:
        name = str(e.get("display_name") or e.get("name") or "")
        areas = e.get("research_areas") or e.get("areas") or []
        if "(synthetic)" in name:
            synthetic = True
        out.append({
            "name": name,
            "unit": e.get("unit") or e.get("department") or "",
            "areas": areas,
            "url": e.get("profile_url") or e.get("url") or "",
        })
    return out, synthetic


def score_field(field: str, researcher: dict) -> dict:
    want = set(tokens(field))
    have = set(tokens(" ".join(researcher["areas"]) + " " + researcher["unit"]))
    cover = have & want
    pct = round(100 * len(cover) / max(len(want), 1))
    score = min(100, pct)
    band = next((b for min_score, b in BANDS if score >= min_score), "insufficient")
    reasons = []
    if cover:
        reasons.append("expertise covers: " + ", ".join(sorted(cover)[:6]))
    if researcher["unit"]:
        reasons.append(f"unit: {researcher['unit']}")
    return {"score": score, "band": band, "reasons": reasons}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--faculty", default=(
        "C:/Users/athar/nittany-faculty-industry-matchmaking/"
        "matching/data/synthetic/researchers.json"))
    ap.add_argument("--snapshot", default="public/data/snapshot.json")
    ap.add_argument("--out", default="public/data/matches.json")
    args = ap.parse_args()

    faculty, synthetic = load_faculty(Path(args.faculty))
    snapshot = json.loads(Path(args.snapshot).read_text(encoding="utf-8"))

    out = {
        "faculty_count": len(faculty),
        "faculty_file": args.faculty,
        "synthetic_data": synthetic,
        "companies": {},
    }
    for c in snapshot["companies"]:
        if c["lane"] == "unassigned":
            continue
        per_company = []
        for f in c["investment_fields"]:
            results = []
            for r in faculty:
                s = score_field(f["field"], r)
                if s["band"] == "insufficient":
                    continue
                results.append({
                    "rank": 0,
                    "candidate": {"name": r["name"], "unit": r["unit"],
                                  "url": r["url"]},
                } | s)
            results.sort(key=lambda x: -x["score"])
            for i, r in enumerate(results):
                r["rank"] = i + 1
            per_company.append({
                "field": f["field"],
                "latest_date": f["latest_date"],
                "synthetic_data": synthetic,
                "results": results[:5],
            })
        out["companies"][c["company_id"]] = {
            "name": c["name"],
            "fields_matched": len(per_company),
            "fields": per_company,
        }

    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(out, indent=1))
    print(f"wrote {args.out}: {len(faculty)} faculty, "
          f"{sum(v['fields_matched'] for v in out['companies'].values())} matched fields "
          f"(synthetic={synthetic})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
