"""Freeze the live noble engine for static deploys (Vercel et al).

Fetches GET /api/w/live/state (the exact payload the app hydrates) and then
runs POST /api/w/live/match once per open interest, baking the ranked results
into the same file. The dashboard hydrates from this file when the live API
isn't reachable, so a static deploy renders the full dashboard read-only:

    python -I scripts/export_live.py \
        --base http://localhost:5177 --out public/data/noble-snapshot.json

Run it while the noble dev server is up; re-run any time to refresh.
"""

from __future__ import annotations

import argparse
import json
import urllib.request

DEV_USER = "athar@nittany.ai"


def fetch_json(url: str, method: str = "GET", body: dict | None = None) -> dict:
    headers = {"x-dev-user": DEV_USER}
    payload = None
    if body is not None:
        payload = json.dumps(body).encode()
        headers["content-type"] = "application/json"
    req = urllib.request.Request(url, data=payload, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.load(resp)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--base", default="http://localhost:5177")
    ap.add_argument("--workspace", default="live")
    ap.add_argument("--out", default="public/data/noble-snapshot.json")
    args = ap.parse_args()

    state = fetch_json(f"{args.base}/api/w/{args.workspace}/state")
    db = state.get("db", {})
    interests = db.get("interests", {})

    # slim the faculty records to what the UI reads (name/title/dept/email/
    # keywords/summary/…) — bulkier provenance fields are engine-internal
    FACULTY_KEEP = {
        "id", "name", "title", "departmentId", "email", "keywords", "expertise",
        "interests", "summary", "labName", "profileUrl", "availability",
    }
    fac_slim = {
        fid: {k: v for k, v in rec.items() if k in FACULTY_KEEP}
        for fid, rec in db.get("faculty", {}).items()
    }
    db_out = {**db, "faculty": fac_slim}

    matches: dict[str, dict] = {}
    for iid, interest in interests.items():
        if interest.get("status") != "open":
            continue
        text = f"{interest.get('title', '')}. {interest.get('description') or ''}".strip()
        body = {
            "request": {
                "text": text,
                "engagementType": "research",
                "topics": [],
                "disciplines": [],
                "constraints": {},
            }
        }
        result = fetch_json(f"{args.base}/api/w/live/match", method="POST", body=body)
        # the UI renders the top 8 ranked matches; bake exactly that
        if isinstance(result.get("results"), list):
            result = {**result, "results": result["results"][:8]}
        matches[iid] = result
        print(f"  matched {iid} ({interest.get('title', '')[:60]})")

    out = {"db": db_out, "meta": state.get("meta", {}), "matches": matches}
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"wrote {args.out}: {len(interests)} open needs, {len(matches)} precomputed matches")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
