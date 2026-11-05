import { defineService } from '/service.http.js'

function readData(payload, fallbackMessage) {
  if (!payload || payload.success !== true) {
    throw new Error(payload?.message || fallbackMessage)
  }
  return payload.data
}

export const shelfService = defineService(import.meta.url, {
  async listShelf(request, filters = {}) {
    const data = readData(
      await request('/api/app/shelf/list', { method: 'POST', body: filters }),
      '加载上架资源失败'
    )
    return {
      items: data?.items || [],
      total: data?.total || 0,
      page: data?.page || 1,
      pageSize: data?.pageSize || 0
    }
  },

  async unlist(request, id) {
    return readData(
      await request('/api/app/shelf/unlist', { method: 'POST', body: { id } }),
      '下架失败'
    )
  },

  async relist(request, id) {
    return readData(
      await request('/api/app/shelf/relist', { method: 'POST', body: { id } }),
      '恢复上架失败'
    )
  }
})
