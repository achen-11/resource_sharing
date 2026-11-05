/* kooboo-app-base:v2; object-type: CodeBlock */
import { getCurrentIdentity, type AppIdentity } from "code/Services/user";
function normalizePerm(value: unknown): string {
  return String(value || "").trim().replace(/^permission\./i, "").toLowerCase();
}

/**
 * Checks if the current authenticated user has the specified permission.
 * Permission codes follow the "{resource}.{scope}" format, e.g. "order.read", "order.write", "order.read.self".
 */
export function hasPermission(requiredPermission: string | string[], userPermissions?: string[]): boolean {
  if (!requiredPermission) return true;
  let userPerms: string[] = [];
  if (userPermissions && Array.isArray(userPermissions)) {
    userPerms = userPermissions.map(normalizePerm).filter(Boolean);
  } else {
    const identity = getCurrentIdentity();
    if (!identity) return false;
    userPerms = (identity.permissions || []).map(normalizePerm).filter(Boolean);
  }
  if (userPerms.includes("*") || userPerms.includes("all")) return true;
  const checkSingle = (perm: string): boolean => {
    const target = normalizePerm(perm);
    if (!target) return true;
    if (userPerms.includes(target)) return true;
    const dotIndex = target.indexOf(".");
    if (dotIndex > 0) {
      const moduleKey = target.substring(0, dotIndex);
      if (userPerms.includes(`${moduleKey}.*`) || userPerms.includes(`${moduleKey}.all`) || userPerms.includes(moduleKey)) {
        return true;
      }
    }

    // Action-level .all scope (e.g. user has "leave-request.read.all" -> satisfies "leave-request.read")
    if (userPerms.includes(`${target}.all`)) return true;

    // Full action satisfies .self scope (e.g. having "order.read" satisfies required "order.read.self")
    if (target.endsWith(".self")) {
      const basePerm = target.slice(0, -5);
      if (userPerms.includes(basePerm) || userPerms.includes(`${basePerm}.all`)) return true;
    }

    // Read scope compatibility: having "order.read.self" or "order.read.team" satisfies required "order.read"
    if (!target.endsWith(".self")) {
      if (userPerms.includes(`${target}.self`) || userPerms.includes(`${target}.team`) || userPerms.includes(`${target}.all`)) {
        return true;
      }
    }
    return false;
  };
  if (Array.isArray(requiredPermission)) {
    return requiredPermission.some(perm => checkSingle(perm));
  }
  return checkSingle(requiredPermission);
}

/**
 * Checks if current user has any of the specified permissions.
 */
export function hasAnyPermission(requiredPermissions: string[]): boolean {
  if (!requiredPermissions || requiredPermissions.length === 0) return true;
  return requiredPermissions.some(perm => hasPermission(perm));
}

/**
 * Throws an authorization error if the user lacks the required permission.
 */
export function requirePermission(requiredPermission: string | string[]): void {
  if (!hasPermission(requiredPermission)) {
    const permLabel = Array.isArray(requiredPermission) ? requiredPermission.join(" | ") : requiredPermission;
    throw new Error(`FORBIDDEN: 无操作权限 [${permLabel}]`);
  }
}

/**
 * Resolves the data scope for a given action on a resource.
 * Returns "all" if user has "{resource}.{action}", "self" if user has "{resource}.{action}.self", "team" if "{resource}.{action}.team", or null if forbidden.
 */
export function getPermissionScope(resource: string, action: string = "read"): "all" | "self" | "team" | null {
  const identity = getCurrentIdentity();
  if (!identity) return null;
  const rawPerms = identity.permissions || [];
  const userPerms = rawPerms.map(normalizePerm).filter(Boolean);
  const res = normalizePerm(resource);
  const act = normalizePerm(action);
  if (userPerms.includes("*") || userPerms.includes("all")) return "all";
  if (userPerms.includes(`${res}.*`) || userPerms.includes(`${res}.all`) || userPerms.includes(res)) return "all";
  if (userPerms.includes(`${res}.${act}`) || userPerms.includes(`${res}.${act}.all`)) return "all";
  if (userPerms.includes(`${res}.${act}.team`)) return "team";
  if (userPerms.includes(`${res}.${act}.self`)) return "self";
  return null;
}

/**
 * Wraps an operation with required permission enforcement.
 */
export function protect<T>(requiredPermission: string | string[], handler: (identity: AppIdentity) => T): T {
  requirePermission(requiredPermission);
  const identity = getCurrentIdentity();
  if (!identity) throw new Error("UNAUTHORIZED: 用户未登录");
  return handler(identity);
}