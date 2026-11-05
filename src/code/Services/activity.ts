/* object-type: CodeBlock */
// Append-only audit trail for resource governance actions (shelf changes and deletions).
// Review decisions stay on the version row (ReviewedByUserName / ReviewedAt / ReviewComment).
// Reads are limited to the owner, reviewers of that resource, and platform admins.
import { reviewAuthority } from "code/Services/review";
import { ReviewActor } from "code/Services/review";
export interface ActivityItem {
  id: string;
  resourceId: string;
  resourceName: string;
  action: string;
  actionLabel: string;
  fromStatus: string;
  toStatus: string;
  actorUserName: string;
  detail: string;
  createdAt: string;
}

/** Minimum actor shape for an audit write; review and resource actors both satisfy it. */
export interface AuditActor {
  userId: string;
  userName: string;
}
export interface ActivityInput {
  resourceId: string;
  resourceName: string;
  action: string;
  actionLabel: string;
  fromStatus: string;
  toStatus: string;
  detail: string;
}
interface ActivityRow {
  id: string;
  resourceId: string;
  resourceName: string | null;
  action: string;
  actionLabel: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  actorUserId: string;
  actorUserName: string | null;
  detail: string | null;
  createdAt: string;
}
const ACTIVITY_SQL = `SELECT Id AS id, ResourceId AS resourceId, ResourceName AS resourceName,
       Action AS action, ActionLabel AS actionLabel, FromStatus AS fromStatus, ToStatus AS toStatus,
       ActorUserId AS actorUserId, ActorUserName AS actorUserName, Detail AS detail,
       CreatedAt AS createdAt
  FROM ResourceActivities`;
function toItem(row: ActivityRow): ActivityItem {
  return {
    id: String(row.id || ""),
    resourceId: String(row.resourceId || ""),
    resourceName: String(row.resourceName || ""),
    action: String(row.action || ""),
    actionLabel: String(row.actionLabel || ""),
    fromStatus: String(row.fromStatus || ""),
    toStatus: String(row.toStatus || ""),
    actorUserName: String(row.actorUserName || ""),
    detail: String(row.detail || ""),
    createdAt: String(row.createdAt || "")
  };
}

/** Best-effort audit write: it must never block the action that triggered it. */
export function recordActivity(input: ActivityInput, actor: AuditActor | null): void {
  if (!input || !input.resourceId || !input.action) {
    return;
  }
  try {
    k.DB.sqlite.execute(`INSERT INTO ResourceActivities (
               Id, ResourceId, ResourceName, Action, ActionLabel, FromStatus, ToStatus,
               ActorUserId, ActorUserName, Detail, CreatedAt
             ) VALUES (
               @id, @resourceId, @resourceName, @action, @actionLabel, @fromStatus, @toStatus,
               @actorUserId, @actorUserName, @detail, @now
             )`, {
      id: k.security.newGuid(),
      resourceId: input.resourceId,
      resourceName: input.resourceName || "",
      action: input.action,
      actionLabel: input.actionLabel || "",
      fromStatus: input.fromStatus || "",
      toStatus: input.toStatus || "",
      actorUserId: actor ? actor.userId : "",
      actorUserName: actor ? String(actor.userName || "") : "",
      detail: input.detail || "",
      now: new Date().toISOString()
    });
  } catch {
    // Auditing is secondary to the operation itself.
  }
}

/** History for one resource, newest first. Empty when the actor may not read it. */
export function listActivities(resourceId: string, actor: ReviewActor | null): ActivityItem[] {
  if (!actor || !actor.userId || !resourceId) {
    return [];
  }
  const rows = k.DB.sqlite.query(`SELECT OwnerUserId AS ownerUserId, Scope AS scope, DepartmentId AS departmentId
           FROM Resources WHERE Id = @id LIMIT 1`, {
    id: resourceId
  });
  if (rows && rows.length > 0) {
    const resource = rows[0] as Record<string, unknown>;
    const isOwner = String(resource.ownerUserId || "") === actor.userId;
    const authority = reviewAuthority(String(resource.scope || "private"), String(resource.departmentId || ""), actor);
    if (!isOwner && actor.isAdmin !== true && !authority) {
      return [];
    }
  } else if (actor.isAdmin !== true) {
    // The resource is gone; only platform admins keep visibility over its trail.
    return [];
  }
  const items = k.DB.sqlite.query(`${ACTIVITY_SQL} WHERE ResourceId = @resourceId ORDER BY CreatedAt DESC LIMIT 100`, {
    resourceId
  });
  const result: ActivityItem[] = [];
  for (const row of (items || []) as ActivityRow[]) {
    result.push(toItem(row));
  }
  return result;
}