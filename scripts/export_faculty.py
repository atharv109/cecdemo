"""Export the PSU University Park faculty directory (xlsx) as noble IngestBatches.

Source: PSU_University_Park_Faculty_2026-11.xlsx (Name, Title, Department,
College, Email, Profile URL, Research Interests, ...).

Produces two batches — departments (unique Dept+College pairs) and faculty —
for noble's ingest contract:

    cd ../../frontend
    npm run ingest -- --file=data/faculty-batch.json --workspace=live

Faculty record id is the PSU directory id from the profile URL
(e.g. .../directory/sfi5068 -> fac-psu-sfi5068) so re-runs are idempotent.
Research Interests are split on ';' into both expertise labels (run through
noble's concept taxonomy) and raw keywords.

Stdlib + pandas; read-only against the workbook.
"""

from __future__ import annotations

import argparse
import json
import re
from datetime import date
from pathlib import Path

import pandas as pd  # type: ignore[import-untyped]

# Column order in the workbook, by itertuples position:
# 0 Name, 1 Title, 2 Department, 3 College, 4 Email, 5 Profile URL,
# 6 Research Interests, 7 Personal Website, 8 Lab / Group Website,
# 9 Emeritus, 10 Also Listed In


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:60]


def psu_dir_id(url: str) -> str | None:
    """Directory id for idempotent records.

    agsci.psu.edu/directory/sfi5068      -> path token
    engr.psu.edu/directory/...x?q=gzn5099 -> `q` query param
    (the naive path regex collapsed every engineering URL onto one id —
    never do that: distinct professors must not share a record id)
    """
    if not url:
        return None
    if "q=" in url:
        m = re.search(r"\?q=([A-Za-z0-9_-]+)", url)
        if m:
            return m.group(1)
    m = re.search(r"/directory/directory-[A-Za-z0-9_.-]+\.aspx", url)
    if m:
        return None  # detail-page style with no q param: unusable as a unique id
    m = re.search(r"/directory/([A-Za-z0-9_-]+)(?:/|$|\.[a-z]+$)", url)
    return m.group(1) if m else None


def clean(text: object) -> str | None:
    """pd.notna + reject literal 'nan' strings."""
    if text is None:
        return None
    s = str(text).strip()
    if not s or s.lower() in {"nan", "nat", "none"}:
        return None
    return s


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--xlsx", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument(
        "--drop-emeritus",
        action="store_true",
        help="keep emeritus rows by default; this flag removes them",
    )
    args = ap.parse_args()

    df = pd.read_excel(args.xlsx, sheet_name="Faculty")
    today = date.today().isoformat()
    src = {
        "sourceId": "psu-directory",
        "label": f"PSU University Park Faculty directory ({today[:7]})",
        "retrievedAt": today,
    }

    departments = df[["Department", "College"]].dropna().drop_duplicates()
    dept_records = [
        {
            "id": f"dept-psu-{slug(str(r.Department))}-{slug(str(r.College))[:24]}",
            "name": str(r.Department).strip(),
            "college": str(r.College).strip(),
        }
        for r in departments.itertuples(index=False)
    ]

    faculty_records = []
    skipped = 0
    seen: set = set()
    for r in df.itertuples(index=False):
        # positional aliases for the unnamed/known columns
        profile_url = getattr(r, "_5", None)
        interests_cell = getattr(r, "_6", None)
        personal_site = getattr(r, "_7", None)
        lab_site = getattr(r, "_8", None)

        name = str(r.Name).strip() if pd.notna(r.Name) else ""
        if not name:
            skipped += 1
            continue
        dir_id = psu_dir_id(clean(profile_url) or "")
        # joint appointments appear as duplicate rows with the same directory id
        dedupe_key = dir_id or f"name:{name.lower()}:{clean(r.Email) or ''}"
        if dedupe_key in seen:
            skipped += 1
            continue
        seen.add(dedupe_key)
        if pd.notna(r.Emeritus) and str(r.Emeritus).strip().lower() == "yes":
            if args.drop_emeritus:
                skipped += 1
                continue

        rec: dict = {
            "name": name,
            "title": (clean(r.Title) or "")[:200],
            "availability": "unknown",
            "emailVerified": True,  # official university directory listing
            "verifiedAt": today,
            "coverageNotes": ["directory row — no project/publication coverage yet"],
        }
        if profile_url is not None:
            url = clean(profile_url)
            if url:
                rec["profileUrl"] = url
                dir_id = psu_dir_id(url)
                if dir_id:
                    rec["id"] = f"fac-psu-{dir_id}"
                    rec["externalIds"] = {"psu": dir_id}
        if pd.notna(r.Department):
            rec["department"] = str(r.Department).strip()
            if pd.notna(r.College):
                rec["college"] = str(r.College).strip()
        else:
            # noble requires a department for new faculty; keep the person honestly
            rec["department"] = "University-wide (no department listed)"
            rec["college"] = "Penn State (unlisted)"
        email = clean(r.Email)
        if email:
            rec["email"] = email
        personal = clean(personal_site)
        if personal:
            rec["personalUrl"] = personal
        lab = clean(lab_site)
        if lab:
            # no lab name in the source; keep the lab site URL as the lab reference
            rec["labName"] = lab[:200]

        interests = clean(interests_cell) or ""
        labels = [t.strip()[:200] for t in re.split(r";", interests) if t.strip()][:100]
        if len(labels) == 1 and "," in labels[0]:
            # comma-separated directory style (e.g. engr.psu.edu): fall back
            labels = [t.strip()[:200] for t in labels[0].split(",") if t.strip()][:100]
        if labels:
            rec["expertise"] = labels
            rec["keywords"] = labels

        faculty_records.append(rec)

    batches = [
        {"entity": "departments", "source": src, "records": dept_records},
        {"entity": "faculty", "source": src, "records": faculty_records},
    ]
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(batches, indent=1))
    print(
        f"wrote {out}: departments={len(dept_records)} faculty={len(faculty_records)} skipped={skipped}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
