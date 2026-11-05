/* object-type: CodeBlock */
// Platform usage numbers: resource counts, downloads per scope / department, top resources
// and top consumers. Restricted to accounts that can review resources or administer the app.

import { ReviewActor } from "code/Services/review";
export interface StatsTotals {
  resources: number;
  listed: number;
  unlisted: number;
  pending: number;
  versions: number;
  downloads: number;
}
export interface ScopeStat {
  scope: string;
  label: string;
  resources: number;
  downloads: number;
}
export interface DepartmentStat {
  departmentName: string;
  resources: number;
  downloads: number;
}
export interface ResourceStat {
  resourceId: string;
  name: string;
  ownerUserName: string;
  categoryName: string;
  downloadCount: number;
  shelfState: string;
}
export interface UserStat {
  userName: string;
  downloads: number;
}
export interface DownloadStat {
  resourceName: string;
  userName: string;
  versionNo: number;
  createdAt: string;
}
export interface StatsOverview {
  totals: StatsTotals;
  byScope: ScopeStat[];
  byDepartment: DepartmentStat[];
  topResources: ResourceStat[];
  topUsers: UserStat[];
  recent: DownloadStat[];
}
interface ResourceStatRow {
  id: string;
  name: string;
  ownerUserName: string | null;
  categoryName: string | null;
  scope: string | null;
  departmentName: string | null;
  shelfStatus: string | null;
  versionCount: number;
  downloadCount: number;
  latestVersionStatus: string | null;
  publishedVersionNo: number;
}
interface DownloadStatRow {
  resourceName: string | null;
  userName: string | null;
  versionNo: number;
  createdAt: string;
}
function isListed(value: unknown): boolean {
  return String(value || "").replace(/['"]/g, "").trim().toLowerCase() !== "unlisted";
}
function scopeLabelOf(scope: string): string {
  if (scope === "public") return "公共";
  if (scope === "department") return "部门";
  if (scope === "private") return "私有";
  return "未设置";
}

/** Same rule as the review queue: admins, plus accounts holding resource.review. */
export function canReadStats(actor: ReviewActor | null): boolean {
  if (!actor || !actor.userId) {
    return false;
  }
  if (actor.isAdmin === true) {
    return true;
  }
  const permissions = actor.permissions || [];
  return permissions.indexOf("*") >= 0 || permissions.indexOf("resource.review") >= 0;
}
export function readStatsOverview(actor: ReviewActor | null): StatsOverview {
  const empty: StatsOverview = {
    totals: {
      resources: 0,
      listed: 0,
      unlisted: 0,
      pending: 0,
      versions: 0,
      downloads: 0
    },
    byScope: [],
    byDepartment: [],
    topResources: [],
    topUsers: [],
    recent: []
  };
  if (!canReadStats(actor)) {
    return empty;
  }
  const rows = (k.DB.sqlite.query(`SELECT Id AS id, Name AS name, OwnerUserName AS ownerUserName, CategoryName AS categoryName,
                Scope AS scope, DepartmentName AS departmentName, ShelfStatus AS shelfStatus,
                VersionCount AS versionCount, DownloadCount AS downloadCount,
                LatestVersionStatus AS latestVersionStatus, PublishedVersionNo AS publishedVersionNo
           FROM Resources`, {}) || []) as ResourceStatRow[];
  const totals: StatsTotals = {
    resources: 0,
    listed: 0,
    unlisted: 0,
    pending: 0,
    versions: 0,
    downloads: 0
  };
  const scopeMap: {
    [key: string]: ScopeStat;
  } = {};
  const departmentMap: {
    [key: string]: DepartmentStat;
  } = {};
  const topResources: ResourceStat[] = [];
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const published = Number(row.publishedVersionNo) || 0;
    const listed = published > 0 && isListed(row.shelfStatus);
    totals.resources++;
    totals.versions += Number(row.versionCount) || 0;
    totals.downloads += Number(row.downloadCount) || 0;
    if (published > 0) {
      if (listed) {
        totals.listed++;
      } else {
        totals.unlisted++;
      }
    }
    if (String(row.latestVersionStatus || "") === "pending") {
      totals.pending++;
    }
    const scopeKey = String(row.scope || "");
    if (!scopeMap[scopeKey]) {
      scopeMap[scopeKey] = {
        scope: scopeKey,
        label: scopeLabelOf(scopeKey),
        resources: 0,
        downloads: 0
      };
    }
    scopeMap[scopeKey].resources++;
    scopeMap[scopeKey].downloads += Number(row.downloadCount) || 0;
    if (scopeKey === "department") {
      const departmentName = String(row.departmentName || "未指定部门");
      if (!departmentMap[departmentName]) {
        departmentMap[departmentName] = {
          departmentName,
          resources: 0,
          downloads: 0
        };
      }
      departmentMap[departmentName].resources++;
      departmentMap[departmentName].downloads += Number(row.downloadCount) || 0;
    }
    topResources.push({
      resourceId: String(row.id || ""),
      name: String(row.name || ""),
      ownerUserName: String(row.ownerUserName || ""),
      categoryName: String(row.categoryName || ""),
      downloadCount: Number(row.downloadCount) || 0,
      shelfState: published === 0 ? "未上架过" : listed ? "在架" : "已下架"
    });
  }
  const byScope: ScopeStat[] = [];
  const scopeKeys = ["public", "department", "private"];
  for (let index = 0; index < scopeKeys.length; index++) {
    const stat = scopeMap[scopeKeys[index]];
    if (stat) {
      byScope.push(stat);
    }
  }
  const byDepartment: DepartmentStat[] = [];
  for (const key in departmentMap) {
    if (departmentMap.hasOwnProperty(key)) {
      byDepartment.push(departmentMap[key]);
    }
  }
  byDepartment.sort((left, right) => right.downloads - left.downloads);
  topResources.sort((left, right) => right.downloadCount - left.downloadCount);
  const downloadRows = (k.DB.sqlite.query(`SELECT ResourceName AS resourceName, UserName AS userName, VersionNo AS versionNo, CreatedAt AS createdAt
           FROM ResourceDownloads ORDER BY CreatedAt DESC LIMIT 5000`, {}) || []) as DownloadStatRow[];
  const userMap: {
    [key: string]: UserStat;
  } = {};
  const recent: DownloadStat[] = [];
  for (let index = 0; index < downloadRows.length; index++) {
    const row = downloadRows[index];
    const userName = String(row.userName || "未知用户");
    if (!userMap[userName]) {
      userMap[userName] = {
        userName,
        downloads: 0
      };
    }
    userMap[userName].downloads++;
    if (index < 10) {
      recent.push({
        resourceName: String(row.resourceName || ""),
        userName,
        versionNo: Number(row.versionNo) || 0,
        createdAt: String(row.createdAt || "")
      });
    }
  }
  const topUsers: UserStat[] = [];
  for (const key in userMap) {
    if (userMap.hasOwnProperty(key)) {
      topUsers.push(userMap[key]);
    }
  }
  topUsers.sort((left, right) => right.downloads - left.downloads);
  return {
    totals,
    byScope,
    byDepartment: byDepartment.slice(0, 8),
    topResources: topResources.slice(0, 10),
    topUsers: topUsers.slice(0, 8),
    recent
  };
}