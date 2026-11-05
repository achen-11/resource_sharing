import { defineService } from '/service.http.js'

function readData(payload, fallbackMessage) {
  if (!payload || payload.success !== true) {
    throw new Error(payload?.message || fallbackMessage)
  }
  return payload.data
}

export const activityService = defineService(import.meta.url, {
  async listActivities(request, resourceId) {
    const data = readData(
      await request('/api/app/activity/list', { method: 'POST', body: { resourceId } }),
      '加载操作记录失败'
    )
    return data?.items || []
  }
})
