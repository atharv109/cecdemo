/** One-off parity check: vendored baseline (client-side) vs baked engine match. */
import fs from "node:fs";
import path from "node:path";
import { runBaseline } from "../src/lib/engine/matching/baseline";
import type { MatchCorpus, MatchRequest } from "../src/lib/engine/matching/types";

const snap = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "..", "public", "data", "noble-snapshot.json"), "utf8"),
) as {
  db: {
    faculty: Record<string, unknown>;
    departments?: Record<string, unknown>;
    interests: Record<string, { title: string; description?: string; status: string }>;
  };
  matches: Record<string, { results?: { facultyId: string; score: number; band: string }[] }>;
};

const corpus: MatchCorpus = {
  faculty: Object.values(snap.db.faculty) as MatchCorpus["faculty"],
  departments: (snap.db.departments ?? {}) as MatchCorpus["departments"],
  projects: [],
  publications: [],
  ip: [],
};

function match(text: string) {
  const req: MatchRequest = {
    text,
    engagementType: "research",
    topics: [],
    disciplines: [],
    constraints: {},
  };
  const t0 = Date.now();
  const res = runBaseline(req, corpus);
  const ms = Date.now() - t0;
  return { res, ms };
}

// 1) free-text search typed on the deployed read-only demo
const glass = match("glass");
console.log(
  `free text "glass": ${glass.ms}ms, ${glass.res.results.length} results, inferred=[${glass.res.inferredConcepts}]`,
  glass.res.results.slice(0, 3).map((r) => `${r.facultyId} ${r.score} ${r.band} ${(r.summary ?? "").slice(0, 60)}`),
);

// 2) engine parity: client-side must reproduce the baked engine match
const needId = "ci-mwa5vivs013f5"; // IBM Quantum Computing
const need = snap.db.interests[needId];
const client = match(`${need.title}. ${need.description ?? ""}`).res;
const engineTop = (snap.matches[needId]?.results ?? []).slice(0, 8).map((r) => r.facultyId);
const clientTop = client.results.slice(0, 8).map((r) => r.facultyId);
const same = JSON.stringify(engineTop) === JSON.stringify(clientTop);
console.log(`parity ${needId}: top8 identical = ${same}`);
if (!same) {
  console.log("engine:", engineTop);
  console.log("client:", clientTop);
}
