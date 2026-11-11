import type { Department, Faculty, ID, IPRecord, MatchRequest, Project, Publication } from '../types';

/**
 * The matching service boundary.
 *
 * The frontend only ever talks to a `MatchProvider` through `POST /api/match`.
 * Ian's algorithm can replace the baseline by implementing this interface (in
 * process) or by exposing an HTTP endpoint that accepts `{ request, corpus }`
 * and returns a `MatchResponse` (see server/providers.ts).
 */
export interface MatchProvider {
  id: string;
  name: string;
  version: string;
  description: string;
  match(request: MatchRequest, corpus: MatchCorpus, opts?: { now?: Date }): Promise<MatchResponse> | MatchResponse;
}

export interface MatchCorpus {
  faculty: Faculty[];
  departments: Record<ID, Department>;
  projects: Project[];
  publications: Publication[];
  ip: IPRecord[];
}

export type ComponentKey = 'topic' | 'expertise' | 'active' | 'evidence' | 'pathway';

export interface ScoreComponent {
  key: ComponentKey;
  label: string;
  weight: number; // nominal weight, 0..1
  /** 0..100, or null when the data needed to judge it doesn't exist. */
  score: number | null;
  explanation: string;
}

export interface ScoreAdjustment {
  label: string;
  points: number;
  explanation: string;
}

export type EvidenceType = 'expertise' | 'keyword' | 'summary' | 'project' | 'publication' | 'ip';

export interface EvidenceItem {
  type: EvidenceType;
  id?: ID;
  title: string;
  detail?: string;
  date?: string;
  concepts: string[]; // request concepts this item supports
  strength: number; // 0..1 — direct vs related, recency
  active?: boolean;
}

export interface ConceptHit {
  concept: string;
  strength: number; // 0..1
  direct: boolean;
  via: EvidenceType[];
}

export interface Confidence {
  score: number; // 0..100
  level: 'high' | 'medium' | 'low';
  factors: { label: string; value: number; detail: string }[];
}

export type Band = 'strong' | 'good' | 'possible' | 'weak';

export interface MatchResult {
  facultyId: ID;
  rank: number;
  score: number;
  band: Band;
  components: ScoreComponent[];
  adjustments: ScoreAdjustment[];
  concepts: ConceptHit[];
  evidence: EvidenceItem[];
  unknowns: string[];
  concerns: string[];
  confidence: Confidence;
  summary: string;
  pathways: string[]; // suggested collaboration formats
  relatedProjectIds: ID[];
  relatedIpIds: ID[];
}

export interface MatchResponse {
  providerId: string;
  providerVersion: string;
  generatedAt: string;
  method: string;
  requestConcepts: string[];
  inferredConcepts: string[]; // detected from free text
  results: MatchResult[];
  excluded: { facultyId: ID; reason: string }[];
  considered: number;
}
