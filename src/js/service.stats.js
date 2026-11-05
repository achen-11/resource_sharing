import { defineService } from '/service.http.js'

function readData(payload, fallbackMessage) {
  if (!payload || payload.success !== true) {
    throw new Error(payload?.message || fallbackMessage)
  }
  return payload.data
}

export const statsService = defineService(import.meta.url, {
  async overview(request) {
    const data = readData(
      await request('/api/app/stats/overview', { method: 'POST', body: {} }),
      '加载统计失败'
    )
    return {
      totals: data?.totals || { resources: 0, listed: 0, unlisted: 0, pending: 0, versions: 0, downloads: 0 },
      byScope: data?.byScope || [],
      byDepartment: data?.byDepartment || [],
      topResources: data?.topResources || [],
      topUsers: data?.topUsers || [],
      recent: data?.recent || []
    }
  }
})
