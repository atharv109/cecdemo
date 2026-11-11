/**
 * Roles and permissions — the single source of truth for who may do what.
 * Used by the server (enforcement) and the client (hiding/disabling controls).
 *
 *   viewer   → read everything, leave feedback
 *   staff    → work opportunities, companies, faculty data, matches, drafts, imports
 *   reviewer → staff + make review decisions (approve / reject / request changes)
 *   admin    → reviewer + manage users, API keys, data sources, departments
 */
import type { CollectionName, User } from './types';

export type Role = 'viewer' | 'staff' | 'reviewer' | 'admin';

export const ROLES: { id: Role; label: string; description: string }[] = [
  { id: 'viewer', label: 'Viewer', description: 'Read-only access. Can leave feedback.' },
  { id: 'staff', label: 'Staff', description: 'Runs matches, manages opportunities, companies and research records. Cannot approve reviews.' },
  { id: 'reviewer', label: 'Reviewer', description: 'Everything staff can do, plus approve, reject or return review items.' },
  { id: 'admin', label: 'Administrator', description: 'Everything, plus users, API keys, data sources and departments.' },
];

const RANK: Record<Role, number> = { viewer: 0, staff: 1, reviewer: 2, admin: 3 };

export const atLeast = (user: Pick<User, 'role' | 'active'> | undefined, role: Role) =>
  !!user && user.active !== false && RANK[user.role] >= RANK[role];

export const canReview = (user: Pick<User, 'role' | 'active'> | undefined) => atLeast(user, 'reviewer');
export const canEdit = (user: Pick<User, 'role' | 'active'> | undefined) => atLeast(user, 'staff');
export const isAdmin = (user: Pick<User, 'role' | 'active'> | undefined) => atLeast(user, 'admin');

/** Minimum role needed to create or update a record in each collection. */
export const WRITE_ROLE: Record<CollectionName, Role> = {
  users: 'admin',
  departments: 'admin',
  sources: 'admin',
  faculty: 'staff',
  companies: 'staff',
  interests: 'staff',
  relationships: 'staff',
  projects: 'staff',
  publications: 'staff',
  ip: 'staff',
  searches: 'staff',
  opportunities: 'staff',
  reviews: 'staff', // decisions additionally require reviewer — see server/validate.ts
  drafts: 'staff',
  activities: 'staff',
  tasks: 'staff',
  signals: 'staff',
  issues: 'staff',
  imports: 'staff',
  feedback: 'viewer',
  shortlists: 'staff',
  notifications: 'viewer',
};

/** Minimum role needed to delete a record. Most data is never hard-deleted. */
export const DELETE_ROLE: Partial<Record<CollectionName, Role>> = {
  searches: 'staff',
  shortlists: 'staff',
  tasks: 'staff',
  companies: 'reviewer', // merges of duplicates
  faculty: 'admin',
  projects: 'staff',
  publications: 'staff',
  interests: 'staff',
};

export function canWrite(user: Pick<User, 'role' | 'active'> | undefined, collection: CollectionName, op: 'put' | 'delete') {
  if (op === 'delete') {
    const r = DELETE_ROLE[collection];
    return !!r && atLeast(user, r);
  }
  return atLeast(user, WRITE_ROLE[collection]);
}
