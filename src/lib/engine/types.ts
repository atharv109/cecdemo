/**
 * Domain model.
 *
 * Every record is a plain JSON document keyed by `id`. The server stores each
 * collection in SQLite today; the shapes are deliberately relational-friendly
 * (foreign keys are ids, arrays are small) so a move to PostgreSQL tables is
 * mechanical.
 */

export type ID = string;
export type ISODate = string;

/* ----------------------------------------------------------------------------
 * Provenance
 * ------------------------------------------------------------------------- */

export type SourceKind =
  | 'api'
  | 'faculty-directory'
  | 'publication-db'
  | 'university-records'
  | 'ott'
  | 'import'
  | 'manual'
  | 'company-site'
  | 'news';

export interface SourceRef {
  sourceId: ID; // DataSource.id
  label: string; // human-readable, e.g. "Dept. faculty page"
  url?: string;
  retrievedAt: ISODate;
}

export type Freshness = 'fresh' | 'aging' | 'stale' | 'unknown';

/* ----------------------------------------------------------------------------
 * People & organizations
 * ------------------------------------------------------------------------- */

export interface User {
  id: ID;
  name: string;
  /** Login identity. In header-auth mode this is matched against the SSO header. */
  email: string;
  initials: string;
  /** Job title shown in the UI, e.g. "Engagement Lead · CEC". */
  title: string;
  team: string; // e.g. "CEC", "OTT", "Research Office"
  role: import('./roles').Role;
  active: boolean;
  createdAt?: ISODate;
  lastSeenAt?: ISODate;
}

/** Identifiers in external systems (ORCID, OpenAlex, internal directory ids, DOIs, ...). */
export type ExternalIds = Record<string, string>;

/** Per-field provenance: which source last set a field, and when. Drives conflict detection on sync. */
export type Provenance = Record<string, { sourceId: ID; at: ISODate }>;

export interface Department {
  id: ID;
  name: string;
  college: string;
}

export type Pathway = 'research' | 'talent' | 'engagement';

export interface CollaborationInterest {
  pathway: Pathway;
  note: string;
  verified: boolean; // only true when the faculty member confirmed it
}

export interface Faculty {
  id: ID;
  externalIds?: ExternalIds;
  provenance?: Provenance;
  name: string;
  title: string;
  departmentId: ID;
  summary: string;
  expertise: string[]; // concept ids from the taxonomy
  keywords: string[]; // free-text keywords as listed by the source
  labName?: string;
  labSize?: number; // grad students + postdocs, when known
  email?: string;
  emailVerified: boolean;
  profileUrl?: string;
  interests: CollaborationInterest[];
  availability: 'unknown' | 'open' | 'limited' | 'unavailable';
  lastVerified?: ISODate;
  sources: SourceRef[];
  /** Records are known to be incomplete, e.g. only one project listed. */
  coverageNotes: string[];
  saved?: boolean;
}

export type CompanySize = 'startup' | 'mid-size' | 'enterprise';

export interface Company {
  id: ID;
  externalIds?: ExternalIds;
  provenance?: Provenance;
  name: string;
  industry: string;
  website?: string;
  hq?: string;
  size: CompanySize;
  description: string;
  objectives: string[];
  relationship: 'prospect' | 'active' | 'dormant' | 'former';
  ownerId?: ID;
  notes: Note[];
  createdAt: ISODate;
  lastTouch?: ISODate;
  sources: SourceRef[];
}

/** A distinct need a company has. Companies usually have several. */
export interface CompanyInterest {
  id: ID;
  companyId: ID;
  pathway: Pathway;
  title: string;
  description: string;
  topics: string[]; // concept ids
  status: 'open' | 'exploring' | 'paused' | 'fulfilled';
  createdAt: ISODate;
}

/** A known, existing link between a company and the university. */
export interface Relationship {
  id: ID;
  companyId: ID;
  kind: 'sponsored-project' | 'recruiting' | 'license' | 'membership' | 'event' | 'advisory';
  title: string;
  description: string;
  since?: ISODate;
  until?: ISODate;
  facultyIds: ID[];
  departmentIds: ID[];
  status: 'active' | 'ended' | 'unknown';
  source: SourceRef;
}

export interface Note {
  id: ID;
  authorId: ID;
  at: ISODate;
  text: string;
}

/* ----------------------------------------------------------------------------
 * Research evidence
 * ------------------------------------------------------------------------- */

export interface Project {
  id: ID;
  externalIds?: ExternalIds;
  provenance?: Provenance;
  title: string;
  facultyIds: ID[];
  description: string;
  topics: string[];
  start?: ISODate;
  end?: ISODate;
  status: 'active' | 'completed' | 'unknown';
  sponsor?: string; // e.g. "NSF", "DOE" — only when sourced
  fundingNote?: string;
  source: SourceRef;
}

export interface Publication {
  id: ID;
  externalIds?: ExternalIds;
  provenance?: Provenance;
  title: string;
  venue: string;
  year: number;
  facultyIds: ID[];
  topics: string[];
  doi?: string;
  source: SourceRef;
}

export type IPStatus =
  | 'disclosure'
  | 'provisional'
  | 'patent-pending'
  | 'issued'
  | 'unknown';

export type LicensingStatus = 'available' | 'optioned' | 'licensed' | 'unknown';

export interface IPRecord {
  id: ID;
  externalIds?: ExternalIds;
  provenance?: Provenance;
  title: string;
  reference?: string; // docket / patent number when verified
  status: IPStatus;
  licensing: LicensingStatus;
  facultyIds: ID[];
  summary: string;
  applications: string[];
  topics: string[];
  filed?: ISODate;
  verified: boolean;
  source: SourceRef;
  flaggedForReview?: boolean;
  linkedInterestIds: ID[];
}

/* ----------------------------------------------------------------------------
 * Matching
 * ------------------------------------------------------------------------- */

export type EngagementType = 'research' | 'talent' | 'engagement' | 'licensing';

export interface MatchRequest {
  text: string;
  companyId?: ID;
  interestId?: ID;
  engagementType: EngagementType;
  topics: string[]; // concept ids chosen/confirmed by the user
  excludedTopics?: string[]; // detected in text but removed by the user
  disciplines: string[]; // college names to prefer
  outcome?: string;
  budget?: string;
  timeline?: string;
  location?: string;
  constraints: {
    requireIP?: boolean;
    requireVerifiedContact?: boolean;
    activeResearchOnly?: boolean;
    excludeFacultyIds?: ID[];
  };
  notes?: string;
}

export type CandidateStatus =
  | 'suggested'
  | 'saved'
  | 'promising'
  | 'needs-info'
  | 'dismissed'
  | 'in-review';

export interface Candidate {
  facultyId: ID;
  status: CandidateStatus;
  note?: string;
  dismissReason?: string;
  updatedAt?: ISODate;
}

export interface MatchSearch {
  id: ID;
  title: string;
  request: MatchRequest;
  providerId: string;
  createdAt: ISODate;
  createdBy: ID;
  candidates: Candidate[];
  opportunityId?: ID;
  /** Score + band snapshot so we can compare predictions to outcomes later. */
  snapshot: { facultyId: ID; score: number; confidence: number; rank: number }[];
}

/* ----------------------------------------------------------------------------
 * Opportunities & pipeline
 * ------------------------------------------------------------------------- */

export type OpportunityType =
  | 'sponsored-research'
  | 'faculty-collaboration'
  | 'recruiting'
  | 'licensing'
  | 'event-sponsorship'
  | 'center-membership';

export type Stage =
  | 'new'
  | 'discovery'
  | 'matching'
  | 'review'
  | 'intro-prepared'
  | 'intro-recorded'
  | 'discussion'
  | 'outcome'
  | 'closed';

export type Priority = 'high' | 'medium' | 'low';

export type OutcomeKind =
  | 'successful-collaboration'
  | 'agreement-signed'
  | 'productive-introduction'
  | 'wrong-expertise'
  | 'no-response'
  | 'faculty-unavailable'
  | 'budget-mismatch'
  | 'duplicate-relationship'
  | 'priorities-changed'
  | 'other';

export interface OutcomeRecord {
  kind: OutcomeKind;
  note?: string;
  recordedAt: ISODate;
  recordedBy: ID;
  facultyId?: ID;
}

export interface Opportunity {
  id: ID;
  title: string;
  companyId: ID;
  interestId?: ID;
  type: OpportunityType;
  description: string;
  stage: Stage;
  priority: Priority;
  ownerId: ID;
  facultyIds: ID[];
  matchSearchId?: ID;
  nextAction?: string;
  followUp?: ISODate;
  estimatedValue?: { amount: number; basis: string };
  outcomes: OutcomeRecord[];
  closeReason?: string;
  notes: Note[];
  createdAt: ISODate;
  updatedAt: ISODate;
  stageEnteredAt: ISODate;
  stageHistory: { stage: Stage; at: ISODate; by: ID }[];
  signalIds: ID[];
}

/* ----------------------------------------------------------------------------
 * Human review
 * ------------------------------------------------------------------------- */

export type ReviewKind =
  | 'match'
  | 'introduction'
  | 'faculty-verification'
  | 'company-info'
  | 'low-confidence'
  | 'data-conflict'
  | 'incomplete-opportunity'
  | 'ip-review';

export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'changes-requested';

export interface ReviewCheck {
  key: string;
  label: string;
  hint?: string;
  checked: boolean;
}

export interface ReviewEvent {
  at: ISODate;
  by: ID;
  action: 'created' | 'commented' | 'approved' | 'rejected' | 'changes-requested' | 'reopened' | 'checked' | 'assigned';
  note?: string;
}

export interface ReviewItem {
  id: ID;
  kind: ReviewKind;
  title: string;
  summary: string;
  reason: string; // why a human must look
  status: ReviewStatus;
  priority: Priority;
  createdAt: ISODate;
  createdBy: ID;
  assigneeId?: ID;
  decidedAt?: ISODate;
  decidedBy?: ID;
  facultyId?: ID;
  companyId?: ID;
  opportunityId?: ID;
  matchSearchId?: ID;
  dataIssueId?: ID;
  ipId?: ID;
  missing: string[];
  checklist: ReviewCheck[];
  history: ReviewEvent[];
  /**
   * Relevance score quoted when the review was requested. Historical: a later
   * recomputation (new evidence, new matcher version) may differ, and the UI shows both.
   */
  scoreAtRequest?: number;
}

export interface IntroDraft {
  id: ID;
  opportunityId: ID;
  facultyId: ID;
  reviewId: ID;
  subject: string;
  body: string;
  status: 'draft' | 'recorded-sent';
  createdAt: ISODate;
  createdBy: ID;
  updatedAt: ISODate;
  recordedAt?: ISODate;
  recordedBy?: ID;
  recordedChannel?: string;
}

/* ----------------------------------------------------------------------------
 * Activity, tasks, signals
 * ------------------------------------------------------------------------- */

export type ActivityKind =
  | 'stage-change'
  | 'note'
  | 'review'
  | 'intro-draft'
  | 'intro-recorded'
  | 'meeting'
  | 'call'
  | 'email-logged'
  | 'match'
  | 'created'
  | 'outcome'
  | 'signal'
  | 'data'
  | 'task';

export interface Activity {
  id: ID;
  at: ISODate;
  actorId: ID;
  kind: ActivityKind;
  text: string;
  companyId?: ID;
  opportunityId?: ID;
  facultyId?: ID;
  reviewId?: ID;
}

export interface Task {
  id: ID;
  title: string;
  due: ISODate;
  ownerId: ID;
  done: boolean;
  doneAt?: ISODate;
  companyId?: ID;
  opportunityId?: ID;
  createdAt: ISODate;
}

export type SignalKind =
  | 'new-project'
  | 'new-publication'
  | 'new-ip'
  | 'company-announcement'
  | 'company-focus-change'
  | 'funding-announcement'
  | 'new-interest'
  | 'record-updated';

export interface Signal {
  id: ID;
  kind: SignalKind;
  title: string;
  detail: string;
  date: ISODate;
  source: SourceRef;
  facultyIds: ID[];
  companyIds: ID[];
  topics: string[];
  suggestedAction: string;
  status: 'new' | 'reviewed' | 'converted' | 'dismissed';
  opportunityId?: ID;
  ingestedBy: string; // provider id, e.g. "demo-feed"
}

/* ----------------------------------------------------------------------------
 * Data health
 * ------------------------------------------------------------------------- */

export interface DataSource {
  id: ID;
  name: string;
  kind: SourceKind;
  provider: string; // provider adapter id
  status: 'demo' | 'not-connected' | 'manual' | 'awaiting-access' | 'connected' | 'error';
  lastResult?: { at: ISODate; created: number; updated: number; conflicts: number; errors: number; message?: string };
  description: string;
  owner: string;
  lastSync?: ISODate;
  cadence?: string;
  recordTypes: string[];
  accessNote: string;
}

export type DataIssueKind = 'stale' | 'missing' | 'conflict' | 'duplicate' | 'unverified-contact';

export interface DataIssue {
  id: ID;
  kind: DataIssueKind;
  entity: 'faculty' | 'company' | 'project' | 'publication' | 'ip';
  entityId: ID;
  field?: string;
  detail: string;
  values?: { value: string; sourceId: ID }[];
  duplicateOfId?: ID;
  status: 'open' | 'resolved' | 'ignored';
  resolution?: string;
  resolvedBy?: ID;
  resolvedAt?: ISODate;
  createdAt: ISODate;
}

export interface ImportBatch {
  id: ID;
  at: ISODate;
  by: ID;
  fileName: string;
  entity: string;
  created: number;
  skipped: number;
  duplicates: number;
  sourceId: ID;
}

export interface Feedback {
  id: ID;
  at: ISODate;
  authorId: ID;
  stakeholder?: string; // "CEC", "OTT", ...
  page: string;
  kind: 'match-quality' | 'missing-data' | 'workflow' | 'idea' | 'other';
  text: string;
  status: 'open' | 'triaged' | 'closed';
}

export interface Shortlist {
  id: ID;
  name: string;
  description?: string;
  facultyIds: ID[];
  createdAt: ISODate;
  createdBy: ID;
}

export interface Notification {
  id: ID;
  at: ISODate;
  userId: ID;
  kind: 'review' | 'follow-up' | 'data' | 'signal' | 'mention';
  text: string;
  href: string;
  read: boolean;
}

/* ----------------------------------------------------------------------------
 * Database shape
 * ------------------------------------------------------------------------- */

export interface Database {
  users: Record<ID, User>;
  departments: Record<ID, Department>;
  faculty: Record<ID, Faculty>;
  companies: Record<ID, Company>;
  interests: Record<ID, CompanyInterest>;
  relationships: Record<ID, Relationship>;
  projects: Record<ID, Project>;
  publications: Record<ID, Publication>;
  ip: Record<ID, IPRecord>;
  searches: Record<ID, MatchSearch>;
  opportunities: Record<ID, Opportunity>;
  reviews: Record<ID, ReviewItem>;
  drafts: Record<ID, IntroDraft>;
  activities: Record<ID, Activity>;
  tasks: Record<ID, Task>;
  signals: Record<ID, Signal>;
  sources: Record<ID, DataSource>;
  issues: Record<ID, DataIssue>;
  imports: Record<ID, ImportBatch>;
  feedback: Record<ID, Feedback>;
  shortlists: Record<ID, Shortlist>;
  notifications: Record<ID, Notification>;
}

export type CollectionName = keyof Database;
export const COLLECTIONS: CollectionName[] = [
  'users', 'departments', 'faculty', 'companies', 'interests', 'relationships',
  'projects', 'publications', 'ip', 'searches', 'opportunities', 'reviews',
  'drafts', 'activities', 'tasks', 'signals', 'sources', 'issues', 'imports',
  'feedback', 'shortlists', 'notifications',
];

/** A unit of change sent to the server. Applied atomically. */
export type Op =
  | { op: 'put'; collection: CollectionName; record: { id: ID } & Record<string, unknown> }
  | { op: 'delete'; collection: CollectionName; id: ID };
