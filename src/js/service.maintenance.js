import { defineService } from '/service.http.js'

function readData(payload, fallbackMessage) {
  if (!payload || payload.success !== true) {
    throw new Error(payload?.message || fallbackMessage)
  }
  return payload.data
}

export const maintenanceService = defineService(import.meta.url, {
  async cleanOrphans(request, { dryRun = false } = {}) {
    const data = readData(
      await request('/api/app/maintenance/clean-orphans', { method: 'POST', body: { dryRun } }),
      '清理孤立文件失败'
    )
    return {
      message: data?.message || '',
      scanned: Number(data?.scanned) || 0,
      deleted: Number(data?.deleted) || 0,
      kept: Number(data?.kept) || 0,
      missing: Number(data?.missing) || 0,
      files: data?.files || []
    }
  }
})
