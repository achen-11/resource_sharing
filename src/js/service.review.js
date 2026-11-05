import { defineService } from '/service.http.js'

function readData(payload, fallbackMessage) {
  if (!payload || payload.success !== true) {
    throw new Error(payload?.message || fallbackMessage)
  }
  return payload.data
}

export const reviewService = defineService(import.meta.url, {
  async listPendingReviews(request, filters = {}) {
    const data = readData(
      await request('/api/app/review/list', { method: 'POST', body: filters }),
      '加载待审列表失败'
    )
    return {
      items: data?.items || [],
      total: data?.total || 0,
      page: data?.page || 1,
      pageSize: data?.pageSize || 0
    }
  },

  async listReviewed(request, filters = {}) {
    const data = readData(
      await request('/api/app/review/history', { method: 'POST', body: filters }),
      '加载审核记录失败'
    )
    return {
      items: data?.items || [],
      total: data?.total || 0,
      page: data?.page || 1,
      pageSize: data?.pageSize || 0
    }
  },

  async getReviewDetail(request, versionId) {
    return readData(
      await request('/api/app/review/detail', { method: 'POST', body: { versionId } }),
      '加载审核详情失败'
    )
  },

  async approve(request, { versionId, comment = '' }) {
    return readData(
      await request('/api/app/review/approve', { method: 'POST', body: { versionId, comment } }),
      '审核通过失败'
    )
  },

  async reject(request, { versionId, comment }) {
    return readData(
      await request('/api/app/review/reject', { method: 'POST', body: { versionId, comment } }),
      '驳回失败'
    )
  }
})
