/* object-type: CodeBlock */
// Business notifications on top of the App Base notification store.
// Every helper swallows its own errors: a failed notification must never fail
// the business action that triggered it.

import { createAppNotification } from "code/Services/notification";
import { listAssignments, rolePermissions } from "code/Services/appRole";
export interface NotifyInput {
  type: string;
  title: string;
  message: string;
  actionUrl: string;
}
function readText(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

/** App-users.id for a Kooboo account id; empty when that account never signed in. */
function appUserId(koobooUserId: string): string {
  if (!koobooUserId) {
    return "";
  }
  try {
    const rows = k.DB.sqlite.query(`SELECT Id AS id FROM AppUsers WHERE KoobooUserId = @koobooUserId LIMIT 1`, {
      koobooUserId
    });
    if (!rows || rows.length === 0) {
      return "";
    }
    return readText(rows[0].id);
  } catch {
    return "";
  }
}

/** Sends one notification per recipient. Returns how many were created. */
export function notifyUsers(koobooUserIds: string[], input: NotifyInput): number {
  let sent = 0;
  const seen: {
    [key: string]: boolean;
  } = {};
  for (let index = 0; index < koobooUserIds.length; index++) {
    const koobooUserId = readText(koobooUserIds[index]);
    if (!koobooUserId || seen[koobooUserId]) {
      continue;
    }
    seen[koobooUserId] = true;
    const recipientUserId = appUserId(koobooUserId);
    if (!recipientUserId) {
      continue;
    }
    try {
      createAppNotification({
        recipientUserId,
        type: input.type,
        title: input.title,
        message: input.message,
        actionUrl: input.actionUrl
      });
      sent++;
    } catch {
      // Notification delivery is best-effort.
    }
  }
  return sent;
}

/** Notifies the resource owner unless the actor is the owner. */
export function notifyResourceOwner(ownerUserId: string, input: NotifyInput, actorKoobooUserId?: string): number {
  const owner = readText(ownerUserId);
  if (!owner) {
    return 0;
  }
  if (actorKoobooUserId && readText(actorKoobooUserId) === owner) {
    return 0;
  }
  return notifyUsers([owner], input);
}

/** Notifies every account whose app role grants resource.review. */
export function notifyReviewers(input: NotifyInput): number {
  const recipients: string[] = [];
  try {
    const assignments = listAssignments();
    for (let index = 0; index < assignments.length; index++) {
      const assignment = assignments[index];
      if (rolePermissions(assignment.roleCode).indexOf("resource.review") >= 0) {
        recipients.push(assignment.koobooUserId);
      }
    }
  } catch {
    return 0;
  }
  return notifyUsers(recipients, input);
}

/** Scope label shared by notification texts. */
export function scopeLabel(scope: string, departmentName: string): string {
  if (scope === "public") {
    return "公共";
  }
  if (scope === "department") {
    return departmentName ? `部门（${departmentName}）` : "部门";
  }
  return "私有";
}