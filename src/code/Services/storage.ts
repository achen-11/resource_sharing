/* object-type: CodeBlock */
// Platform-managed file storage for resources: kfile (FileIO root, served at /__kb/kfile).
// Every upload lands in resources/{resourceId}/ so a resource owns exactly one folder,
// and version rows only store the internal fullName — never a client-supplied path.

export interface StoredFile {
  path: string;
  url: string;
  name: string;
  size: number;
  stringSize: string;
}
export interface StorageResult {
  ok: boolean;
  message: string;
  file: StoredFile | null;
}
interface StoredFileInfo {
  name: string;
  fullName: string;
  size: number;
  stringSize: string;
  url: string;
  relativeUrl: string;
  absoluteUrl: string;
}
interface UploadedFile {
  fileName: string;
  bytes: number[];
  save(fullName: string): StoredFileInfo;
}
export const MAX_FILE_SIZE = 52428800;
const ALLOWED_EXTENSIONS = ["zip", "tar", "gz", "tgz", "7z", "rar", "js", "mjs", "cjs", "md", "json", "yml", "yaml", "sql", "txt"];
const ROOT_FOLDER = "resources";
export function resourceFolder(resourceId: string): string {
  return `${ROOT_FOLDER}/${resourceId}`;
}
export function fileUrl(path: string): string {
  if (!path) {
    return "";
  }
  return `/__kb/kfile/${path}`;
}
function readExtension(fileName: string): string {
  const lower = String(fileName || "").toLowerCase();
  const index = lower.lastIndexOf(".");
  if (index < 0 || index === lower.length - 1) {
    return "";
  }
  return lower.substring(index + 1);
}
function sanitizeName(fileName: string): string {
  const raw = String(fileName || "file");
  let cleaned = "";
  for (const char of raw) {
    if ("\\/:*?\"<>|".indexOf(char) >= 0) {
      cleaned = `${cleaned}-`;
    } else {
      cleaned = `${cleaned}${char}`;
    }
  }
  cleaned = cleaned.trim();
  if (!cleaned) {
    cleaned = "file";
  }
  if (cleaned.length > 80) {
    cleaned = cleaned.substring(cleaned.length - 80);
  }
  return cleaned;
}
export function validateUpload(fileName: string, size: number): string {
  const extension = readExtension(fileName);
  if (!extension) {
    return "文件需要带扩展名";
  }
  if (ALLOWED_EXTENSIONS.indexOf(extension) < 0) {
    return `暂不支持 .${extension} 类型的文件`;
  }
  if (size > MAX_FILE_SIZE) {
    return `文件不能超过 ${Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB`;
  }
  return "";
}

/** Saves an uploaded request file under the resource folder. */
export function saveUpload(file: unknown, resourceId: string): StorageResult {
  const upload = file as UploadedFile;
  if (!upload || !upload.fileName) {
    return {
      ok: false,
      message: "没有收到文件",
      file: null
    };
  }
  if (!resourceId) {
    return {
      ok: false,
      message: "缺少资源标识",
      file: null
    };
  }
  const bytes = upload.bytes ? upload.bytes.length : 0;
  const problem = validateUpload(upload.fileName, bytes);
  if (problem) {
    return {
      ok: false,
      message: problem,
      file: null
    };
  }
  const stamp = new Date().getTime();
  const fullName = `${resourceFolder(resourceId)}/${stamp}-${sanitizeName(upload.fileName)}`;
  let saved: StoredFileInfo | null = null;
  try {
    saved = upload.save(fullName);
  } catch (error) {
    return {
      ok: false,
      message: "文件写入失败，请重试",
      file: null
    };
  }
  if (!saved) {
    return {
      ok: false,
      message: "文件写入失败，请重试",
      file: null
    };
  }
  const path = String(saved.fullName || fullName);
  return {
    ok: true,
    message: "已上传",
    file: {
      path,
      url: String(saved.relativeUrl || saved.url || fileUrl(path)),
      name: String(saved.name || upload.fileName),
      size: Number(saved.size) || bytes,
      stringSize: String(saved.stringSize || "")
    }
  };
}

/** True when the stored path was created for this resource folder. */
export function belongsToResource(path: string, resourceId: string): boolean {
  if (!path || !resourceId) {
    return false;
  }
  return path.indexOf(`${ROOT_FOLDER}/${resourceId}/`) === 0;
}

/** Removes every stored file of a resource. */
export function deleteResourceFiles(resourceId: string): void {
  if (!resourceId) {
    return;
  }
  try {
    const folder = resourceFolder(resourceId);
    if (k.file.folderExists(folder)) {
      k.file.deleteFolder(folder);
    }
  } catch (error) {
    return;
  }
}
export interface CleanupResult {
  ok: boolean;
  message: string;
  scanned: number;
  deleted: number;
  kept: number;
  missing: number;
  files: string[];
}
export interface CleanupOptions {
  dryRun: boolean;
  olderThanHours: number;
}

/**
 * Records a stored file so an upload that never became a version can be found later.
 * Best-effort: file storage must keep working even if the tracking table is unavailable.
 */
export function recordUploadedFile(file: StoredFile, resourceId: string, actor: {
  userId: string;
  userName: string;
} | null): void {
  if (!file || !file.path || !resourceId) {
    return;
  }
  try {
    k.DB.sqlite.execute(`INSERT OR REPLACE INTO ResourceFiles (
               Id, ResourceId, FilePath, FileName, FileSize,
               UploadedByUserId, UploadedByUserName, State, CreatedAt, UsedAt
             ) VALUES (
               @id, @resourceId, @filePath, @fileName, @fileSize,
               @uploadedByUserId, @uploadedByUserName, 'pending', @createdAt, NULL
             )`, {
      id: k.security.newGuid(),
      resourceId,
      filePath: file.path,
      fileName: String(file.name || ""),
      fileSize: Number(file.size) || 0,
      uploadedByUserId: actor ? String(actor.userId || "") : "",
      uploadedByUserName: actor ? String(actor.userName || "") : "",
      createdAt: new Date().toISOString()
    });
  } catch {
    return;
  }
}

/** Marks the stored file behind a saved version as used. */
export function markFileUsed(filePath: string): void {
  const path = String(filePath || "");
  if (!path) {
    return;
  }
  try {
    k.DB.sqlite.execute(`UPDATE ResourceFiles SET State = 'used', UsedAt = @now WHERE FilePath = @filePath`, {
      now: new Date().toISOString(),
      filePath: path
    });
  } catch {
    return;
  }
}

/**
 * Deletes stored files no version references: abandoned uploads (older than the cutoff)
 * and files whose resource no longer exists. Records of referenced files are kept.
 */
export function cleanupOrphanFiles(options: CleanupOptions | null): CleanupResult {
  const dryRun = options ? options.dryRun === true : false;
  const olderThanHours = options && options.olderThanHours > 0 ? options.olderThanHours : 24;
  const cutoff = new Date(Date.now() - olderThanHours * 3600 * 1000).toISOString();
  const result: CleanupResult = {
    ok: true,
    message: "",
    scanned: 0,
    deleted: 0,
    kept: 0,
    missing: 0,
    files: []
  };
  const referenced: {
    [key: string]: boolean;
  } = {};
  const versionRows = k.DB.sqlite.query(`SELECT FilePath AS filePath FROM ResourceVersions WHERE FilePath IS NOT NULL AND FilePath <> ''`, {});
  for (const row of (versionRows || []) as Record<string, unknown>[]) {
    const path = String(row.filePath || "");
    if (path) {
      referenced[path] = true;
    }
  }
  const liveResources: {
    [key: string]: boolean;
  } = {};
  const resourceRows = k.DB.sqlite.query(`SELECT Id AS id FROM Resources`, {});
  for (const row of (resourceRows || []) as Record<string, unknown>[]) {
    liveResources[String(row.id || "")] = true;
  }
  const rows = k.DB.sqlite.query(`SELECT Id AS id, ResourceId AS resourceId, FilePath AS filePath, CreatedAt AS createdAt
           FROM ResourceFiles`, {});
  for (const row of (rows || []) as Record<string, unknown>[]) {
    result.scanned++;
    const id = String(row.id || "");
    const path = String(row.filePath || "");
    if (!path) {
      if (!dryRun) {
        k.DB.sqlite.execute(`DELETE FROM ResourceFiles WHERE Id = @id`, {
          id
        });
      }
      result.deleted++;
      continue;
    }
    if (referenced[path]) {
      result.kept++;
      continue;
    }
    const resourceGone = !liveResources[String(row.resourceId || "")];
    const oldEnough = String(row.createdAt || "") <= cutoff;
    if (!resourceGone && !oldEnough) {
      result.kept++;
      continue;
    }
    if (!dryRun) {
      try {
        if (k.file.exists(path)) {
          k.file.delete(path);
        }
      } catch {
        // A file already gone from disk still loses its tracking row.
      }
      k.DB.sqlite.execute(`DELETE FROM ResourceFiles WHERE Id = @id`, {
        id
      });
    }
    result.deleted++;
    result.files.push(path);
  }
  for (const path in referenced) {
    if (referenced.hasOwnProperty(path) && !k.file.exists(path)) {
      result.missing++;
    }
  }
  result.message = dryRun ? `检查了 ${result.scanned} 条上传记录，可清理 ${result.deleted} 个孤立文件` : `检查了 ${result.scanned} 条上传记录，清理了 ${result.deleted} 个孤立文件`;
  return result;
}