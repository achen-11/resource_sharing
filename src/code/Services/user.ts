/* kooboo-app-base:v2; object-type: CodeBlock */
import { ENV } from "code/ENV";
import { resolveAppPermissions } from "code/Services/appRole";
export interface AppIdentity {
  id: string;
  koobooUserId: string | null;
  userName: string;
  email: string | null;
  displayName: string;
  fullName?: string;
  avatarUrl?: string | null;
  firstName: string | null;
  lastName: string | null;
  language: string;
  role?: string | null;
  roleName?: string | null;
  permissions: string[];
  isAdmin: boolean;
}
export function getCurrentIdentity(): AppIdentity | null {
  if (!k.account.isLogin) return null;
  const current = k.account.user.current;
  const firstName = current.firstName || '';
  const lastName = current.lastName || '';
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || current.userName;
  let effectiveRole = current.ApplicationRole || current.applicationRole;
  // If user has no assigned application role, resolve default role from site's ApplicationRole collection
  if (!effectiveRole || !(effectiveRole.Name || effectiveRole.name)) {
    const defaultRole = k.site?.roles?.default || k.site?.roles?.find?.((r: any) => r.isDefault) || k.site?.roles?.[0];
    if (defaultRole) {
      effectiveRole = defaultRole;
    }
  }
  let permissions: string[] = [];
  const rawPerms = effectiveRole?.Permissions || effectiveRole?.permissions;
  if (rawPerms) {
    try {
      const list = Array.isArray(rawPerms) ? rawPerms : Array.from(rawPerms as any);
      permissions = list.map((p: any) => typeof p === 'string' ? p : p?.name || p?.key || String(p)).filter(Boolean);
    } catch {
      if (typeof rawPerms === 'object' && !Array.isArray(rawPerms)) {
        permissions = Object.keys(rawPerms);
      }
    }
  }
  const isPlatformAdmin = Boolean(current.isAdmin);
  const mergedPermissions: string[] = [];
  const pushPermission = (code: string) => {
    const value = String(code || '').trim();
    if (value && mergedPermissions.indexOf(value) < 0) mergedPermissions.push(value);
  };
  for (const code of permissions) pushPermission(code);
  // App-internal role permissions resolved from AppUserRoles.
  for (const code of resolveAppPermissions(String(current.id || current.Id))) pushPermission(code);
  // Platform/site administrators keep full access so the first administrator can bootstrap roles.
  if (isPlatformAdmin) pushPermission('*');
  return {
    id: String(current.id || current.Id),
    koobooUserId: String(current.id || current.Id),
    userName: current.userName || current.UserName,
    email: current.email || current.Email || null,
    displayName: fullName,
    firstName: firstName || null,
    lastName: lastName || null,
    language: current.language || current.Language || ENV.defaultLanguage,
    role: effectiveRole?.Name || effectiveRole?.name || null,
    roleName: effectiveRole?.DisplayName || effectiveRole?.displayName || effectiveRole?.Name || effectiveRole?.name || null,
    permissions: mergedPermissions,
    isAdmin: isPlatformAdmin
  };
}
export interface AppUser extends AppIdentity {
  createdAt?: string;
  updatedAt?: string;
  lastSeenAt?: string;
}
export interface UpdateProfileInput {
  displayName: string;
}
interface AppUserRow {
  id: string;
  koobooUserId: string;
  userName: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string;
}
export function getCurrentAppUser(): AppUser | null {
  const identity = getCurrentIdentity();
  if (!identity) return null;
  try {
    const now = Date.now();
    const timestamp = new Date(now).toISOString();
    const readUser = () => k.DB.sqlite.query(`
      SELECT Id AS id, KoobooUserId AS koobooUserId, KoobooUserName AS userName,
             Email AS email, DisplayName AS displayName, AvatarUrl AS avatarUrl,
             CreatedAt AS createdAt, UpdatedAt AS updatedAt, LastSeenAt AS lastSeenAt
      FROM AppUsers WHERE KoobooUserId = @koobooUserId LIMIT 1
    `, {
      koobooUserId: identity.koobooUserId
    })[0] as AppUserRow | undefined;
    let user = readUser();
    if (!user) {
      const id = k.security.newGuid();
      // Preserve atomic first-use creation when concurrent requests see no row.
      // Only account-owned fields are synchronized if another request created it.
      k.DB.sqlite.execute(`
        INSERT INTO AppUsers (
          Id, KoobooUserId, KoobooUserName, Email, DisplayName,
          AvatarUrl, CreatedAt, UpdatedAt, LastSeenAt
        ) VALUES (
          @id, @koobooUserId, @userName, @email, @displayName,
          NULL, @timestamp, @timestamp, @timestamp
        ) ON CONFLICT(KoobooUserId) DO UPDATE SET
          KoobooUserName = excluded.KoobooUserName,
          Email = excluded.Email
        WHERE AppUsers.KoobooUserName IS NOT excluded.KoobooUserName
           OR AppUsers.Email IS NOT excluded.Email
      `, {
        id,
        koobooUserId: identity.koobooUserId,
        userName: identity.userName,
        email: identity.email,
        displayName: identity.displayName,
        timestamp
      });
      user = {
        id,
        koobooUserId: String(identity.koobooUserId),
        userName: identity.userName,
        email: identity.email,
        displayName: identity.displayName,
        avatarUrl: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        lastSeenAt: timestamp
      };
    } else {
      const previousSeen = Date.parse(user.lastSeenAt);
      const profileChanged = user.userName !== identity.userName || (user.email || null) !== identity.email;
      const seenExpired = !Number.isFinite(previousSeen) || now - previousSeen >= 5 * 60 * 1000;
      if (profileChanged || seenExpired) {
        k.DB.sqlite.execute(`
          UPDATE AppUsers SET KoobooUserName = @userName, Email = @email,
            LastSeenAt = CASE WHEN julianday(LastSeenAt) IS NULL
                               OR julianday(LastSeenAt) < julianday(@timestamp)
                             THEN @timestamp ELSE LastSeenAt END
          WHERE Id = @id AND KoobooUserId = @koobooUserId
        `, {
          id: user.id,
          koobooUserId: identity.koobooUserId,
          userName: identity.userName,
          email: identity.email,
          timestamp
        });
        user.userName = identity.userName;
        user.email = identity.email;
        user.lastSeenAt = timestamp;
      }
    }
    if (user) {
      const displayName = user.displayName || identity.displayName;
      return {
        ...identity,
        ...user,
        displayName,
        fullName: displayName
      };
    }
  } catch {
    // Optional AppUsers table not present or SQLite uninitialized.
    // Pure Kooboo platform identity is seamlessly returned without database dependency.
  }
  const displayName = identity.displayName;
  return {
    ...identity,
    displayName,
    fullName: displayName
  };
}
export function updateCurrentAppUser(user: AppUser, patch: UpdateProfileInput): AppUser {
  try {
    const updatedAt = new Date().toISOString();
    k.DB.sqlite.execute(`
      UPDATE AppUsers SET DisplayName = @displayName, UpdatedAt = @updatedAt
      WHERE Id = @id AND KoobooUserId = @koobooUserId
    `, {
      displayName: patch.displayName,
      updatedAt,
      id: user.id,
      koobooUserId: user.koobooUserId
    });
  } catch {
    // Optional AppUsers table not present
  }
  return {
    ...user,
    displayName: patch.displayName,
    fullName: patch.displayName
  };
}