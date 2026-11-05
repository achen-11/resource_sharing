import { defineService } from '/service.http.js'

function readData(payload, fallbackMessage) {
  if (!payload || payload.success !== true) {
    throw new Error(payload?.message || fallbackMessage)
  }
  return payload.data
}

export const tokenService = defineService(import.meta.url, {
  async createDownloadToken(request, { versionId, hours = 72 } = {}) {
    const data = readData(
      await request('/api/app/token/create', { method: 'POST', body: { versionId, hours } }),
      '生成下载链接失败'
    )
    return {
      url: data?.url || '',
      expiresAt: data?.expiresAt || '',
      fileName: data?.fileName || '',
      resourceName: data?.resourceName || ''
    }
  }
})
