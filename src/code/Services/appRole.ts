/* object-type: CodeBlock */
// App-internal roles and member directory.
// Roles are defined in code; only the assignment is persisted in AppUserRoles.
// This module must not import Services.user (Services.user imports this one).

export interface AppRoleDefinition {
  code: string;
  name: string;
  description: string;
  permissions: string[];
}
export const APP_ROLES: AppRoleDefinition[] = [{
  code: "platform-admin",
  name: "平台管理员",
  description: "维护分类、成员与全部资源，可审核并上架",
  permissions: ["category.manage", "member.manage", "resource.manage", "resource.review", "resource.publish", "resource.view", "resource.download"]
}, {
  code: "reviewer",
  name: "审核人",
  description: "审核提交上来的资源版本",
  permissions: ["resource.review", "resource.view", "resource.download"]
}, {
  code: "member",
  name: "成员",
  description: "登记自己的资源，浏览并下载他人资源",
  permissions: ["resource.create", "resource.view", "resource.download"]
}];
export interface RoleAssignment {
  koobooUserId: string;
  userName: string;
  roleCode: string;
  roleName: string;
  updatedAt: string;
}
export interface MemberItem {
  koobooUserId: string;
  userName: string;
  displayName: string;
  email: string;
  departments: string[];
  isPlatformAdmin: boolean;
  roleCode: string;
  roleName: string;
  lastSeenAt: string;
}
export interface AssignResult {
  ok: boolean;
  message: string;
}
interface UserProfileRow {
  koobooUserId: string;
  displayName: string | null;
  lastSeenAt: string | null;
}
function roleByCode(code: string): AppRoleDefinition | null {
  for (const role of APP_ROLES) {
    if (role.code === code) {
      return role;
    }
  }
  return null;
}
export function rolePermissions(code: string): string[] {
  const role = roleByCode(code);
  if (!role) {
    return [];
  }
  return role.permissions.slice();
}
export function roleName(code: string): string {
  const role = roleByCode(code);
  return role ? role.name : "";
}

/** Permission codes granted to this account by its app role. Never throws. */
export function resolveAppPermissions(koobooUserId: string): string[] {
  if (!koobooUserId) {
    return [];
  }
  try {
    const rows = k.DB.sqlite.query(`SELECT RoleCode AS roleCode FROM AppUserRoles WHERE KoobooUserId = @koobooUserId LIMIT 1`, {
      koobooUserId
    });
    if (!rows || rows.length === 0) {
      return [];
    }
    return rolePermissions(String(rows[0].roleCode || ""));
  } catch {
    // Optional table not created yet.
    return [];
  }
}
export function getAssignment(koobooUserId: string): RoleAssignment | null {
  const rows = k.DB.sqlite.query(`SELECT KoobooUserId AS koobooUserId, UserName AS userName, RoleCode AS roleCode, UpdatedAt AS updatedAt
           FROM AppUserRoles WHERE KoobooUserId = @koobooUserId LIMIT 1`, {
    koobooUserId
  });
  if (!rows || rows.length === 0) {
    return null;
  }
  const row = rows[0];
  const code = String(row.roleCode || "");
  return {
    koobooUserId: String(row.koobooUserId || ""),
    userName: String(row.userName || ""),
    roleCode: code,
    roleName: roleName(code),
    updatedAt: String(row.updatedAt || "")
  };
}
export function listAssignments(): RoleAssignment[] {
  const rows = k.DB.sqlite.query(`SELECT KoobooUserId AS koobooUserId, UserName AS userName, RoleCode AS roleCode, UpdatedAt AS updatedAt
           FROM AppUserRoles`, {});
  const items: RoleAssignment[] = [];
  if (!rows) {
    return items;
  }
  for (const row of rows) {
    const code = String(row.roleCode || "");
    items.push({
      koobooUserId: String(row.koobooUserId || ""),
      userName: String(row.userName || ""),
      roleCode: code,
      roleName: roleName(code),
      updatedAt: String(row.updatedAt || "")
    });
  }
  return items;
}
function readProfileMap(): {
  [key: string]: UserProfileRow;
} {
  const map: {
    [key: string]: UserProfileRow;
  } = {};
  try {
    const rows = k.DB.sqlite.query(`SELECT KoobooUserId AS koobooUserId, DisplayName AS displayName, LastSeenAt AS lastSeenAt FROM AppUsers`, {});
    if (rows) {
      for (const row of rows) {
        map[String(row.koobooUserId || "")] = {
          koobooUserId: String(row.koobooUserId || ""),
          displayName: String(row.displayName || ""),
          lastSeenAt: String(row.lastSeenAt || "")
        };
      }
    }
  } catch {
    // Optional table not created yet.
  }
  return map;
}
function readDepartmentLabels(user: any): string[] {
  const labels: string[] = [];
  const departments = user ? user.departments : null;
  if (!departments) {
    return labels;
  }
  for (let index = 0; index < departments.length; index++) {
    const department = departments[index];
    const label = String(department.display || department.name || "");
    if (label) {
      labels.push(label);
    }
  }
  return labels;
}
function roleRank(code: string): number {
  if (code === "platform-admin") return 0;
  if (code === "reviewer") return 1;
  if (code === "member") return 2;
  return 3;
}

/** Organization members merged with app role assignments and last-seen data. */
export function listMembers(): MemberItem[] {
  const assignments = listAssignments();
  const assignmentByUser: {
    [key: string]: RoleAssignment;
  } = {};
  for (const item of assignments) {
    assignmentByUser[item.koobooUserId] = item;
  }
  const profileByUser = readProfileMap();
  const items: MemberItem[] = [];
  const seen: {
    [key: string]: boolean;
  } = {};
  let organization = null;
  try {
    organization = k.account.organization.current;
  } catch {
    organization = null;
  }
  const orgUsers = organization ? organization.users : null;
  if (orgUsers) {
    for (let index = 0; index < orgUsers.length; index++) {
      const user = orgUsers[index];
      const koobooUserId = String(user.id || "");
      const userName = String(user.userName || "");
      if (!userName) {
        continue;
      }
      seen[koobooUserId] = true;
      const profile = profileByUser[koobooUserId];
      const assignment = assignmentByUser[koobooUserId];
      const fullName = [String(user.firstName || ""), String(user.lastName || "")].filter(Boolean).join(" ");
      items.push({
        koobooUserId,
        userName,
        displayName: fullName || (profile ? profile.displayName : "") || userName,
        email: String(user.email || ""),
        departments: readDepartmentLabels(user),
        isPlatformAdmin: user.isAdmin === true,
        roleCode: assignment ? assignment.roleCode : "",
        roleName: assignment ? assignment.roleName : "",
        lastSeenAt: profile ? profile.lastSeenAt : ""
      });
    }
  }

  // Accounts that signed in before but are missing from the current organization list.
  for (const other of assignments) {
    if (seen[other.koobooUserId]) {
      continue;
    }
    const profile = profileByUser[other.koobooUserId];
    items.push({
      koobooUserId: other.koobooUserId,
      userName: other.userName,
      displayName: profile ? profile.displayName || other.userName : other.userName,
      email: "",
      departments: [],
      isPlatformAdmin: false,
      roleCode: other.roleCode,
      roleName: other.roleName,
      lastSeenAt: profile ? profile.lastSeenAt : ""
    });
  }
  items.sort((left, right) => {
    const rankDiff = roleRank(left.roleCode) - roleRank(right.roleCode);
    if (rankDiff !== 0) {
      return rankDiff;
    }
    return left.userName.localeCompare(right.userName);
  });
  return items;
}
export function findMemberName(koobooUserId: string): string {
  const members = listMembers();
  for (const member of members) {
    if (member.koobooUserId === koobooUserId) {
      return member.userName;
    }
  }
  return "";
}
export function assignRole(body: unknown, actor: {
  koobooUserId: string;
  userName: string;
}): AssignResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      message: "请求格式不正确"
    };
  }
  const input = body as Record<string, unknown>;
  const koobooUserId = typeof input.koobooUserId === "string" ? input.koobooUserId.trim() : "";
  const roleCode = typeof input.roleCode === "string" ? input.roleCode.trim() : "";
  if (!koobooUserId) {
    return {
      ok: false,
      message: "缺少用户标识"
    };
  }
  if (roleCode && !roleByCode(roleCode)) {
    return {
      ok: false,
      message: "角色不存在"
    };
  }
  // Prevent an administrator from locking themselves out.
  if (actor && actor.koobooUserId && actor.koobooUserId === koobooUserId) {
    return {
      ok: false,
      message: "不能修改自己的角色，请让其他管理员操作"
    };
  }
  const existing = getAssignment(koobooUserId);
  const now = new Date().toISOString();
  if (!roleCode) {
    if (existing) {
      k.DB.sqlite.execute(`DELETE FROM AppUserRoles WHERE KoobooUserId = @koobooUserId`, {
        koobooUserId
      });
    }
    return {
      ok: true,
      message: "已清空角色"
    };
  }
  const userName = existing && existing.userName ? existing.userName : findMemberName(koobooUserId);
  if (existing) {
    k.DB.sqlite.execute(`UPDATE AppUserRoles
                SET RoleCode = @roleCode, UserName = @userName,
                    GrantedByUserName = @grantedBy, UpdatedAt = @now
              WHERE KoobooUserId = @koobooUserId`, {
      koobooUserId,
      roleCode,
      userName,
      grantedBy: actor ? actor.userName : "",
      now
    });
  } else {
    k.DB.sqlite.execute(`INSERT INTO AppUserRoles (Id, KoobooUserId, UserName, RoleCode, GrantedByUserName, CreatedAt, UpdatedAt)
             VALUES (@id, @koobooUserId, @userName, @roleCode, @grantedBy, @now, @now)`, {
      id: k.security.newGuid(),
      koobooUserId,
      userName,
      roleCode,
      grantedBy: actor ? actor.userName : "",
      now
    });
  }
  return {
    ok: true,
    message: "已保存"
  };
}