//@k-url /api/app/download
/* object-type: API */
// Route: /api/app/download?versionId=... or ?path=...&resourceId=...
// Streams a hosted artifact only after Services.download approves the current account, so the
// browser never needs a direct /__kb/kfile URL.
import { denyDownload, recordDownload, resolveUploadCheck, resolveVersionDownload } from "code/Services/download";
import { resolveDownloadToken } from "code/Services/token";
import { resolveReviewActor } from "code/Services/review";
import { errorResponse } from "code/Utils/response";
k.api.get(() => {
  const query = k.request.queryString;

  // Token branch: a time-limited link handed to an outside tool. No session required.
  const token = String(query.get("token") || "");
  if (token) {
    const resolved = resolveDownloadToken(token);
    if (!resolved.target.ok) {
      k.response.statusCode(resolved.target.status);
      return errorResponse(resolved.target.status, "DOWNLOAD_DENIED", resolved.target.message);
    }
    recordDownload(resolved.target, {
      userId: resolved.creatorUserId,
      userName: resolved.creatorUserName,
      isAdmin: false,
      permissions: [],
      departments: []
    });
    k.response.file(resolved.target.filePath, resolved.target.contentType, resolved.target.fileName);
    return;
  }
  const actor = resolveReviewActor();
  const versionId = String(query.get("versionId") || "");
  const path = String(query.get("path") || "");
  const resourceId = String(query.get("resourceId") || "");
  let target = denyDownload("缺少版本标识", 400);
  if (versionId) {
    target = resolveVersionDownload(versionId, actor);
  } else if (path && resourceId) {
    target = resolveUploadCheck(path, resourceId, actor);
  }
  if (!target.ok) {
    k.response.statusCode(target.status);
    return errorResponse(target.status, "DOWNLOAD_DENIED", target.message);
  }
  recordDownload(target, actor);
  k.response.file(target.filePath, target.contentType, target.fileName);
  return;
});