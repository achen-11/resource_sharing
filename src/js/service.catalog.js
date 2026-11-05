import { defineService } from '/service.http.js'

function readData(payload, fallbackMessage) {
  if (!payload || payload.success !== true) {
    throw new Error(payload?.message || fallbackMessage)
  }
  return payload.data
}

export const catalogService = defineService(import.meta.url, {
  async listCatalog(request, filters = {}) {
    const data = readData(
      await request('/api/app/catalog/list', { method: 'POST', body: filters }),
      '加载资源目录失败'
    )
    return {
      items: data?.items || [],
      total: data?.total || 0,
      page: data?.page || 1,
      pageSize: data?.pageSize || 0
    }
  },

  async getCatalogItem(request, id) {
    return readData(
      await request('/api/app/catalog/detail', { method: 'POST', body: { id } }),
      '加载资源详情失败'
    )
  }
})
