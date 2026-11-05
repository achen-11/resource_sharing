import { defineService } from '/service.http.js'

function readData(payload, fallbackMessage) {
  if (!payload || payload.success !== true) {
    throw new Error(payload?.message || fallbackMessage)
  }
  return payload.data
}

export const resourceService = defineService(import.meta.url, {
  async getMeta(request) {
    const data = readData(await request('/api/app/resource/meta', { method: 'POST', body: {} }), '加载选项失败')
    return { departments: data?.departments || [] }
  },

  async listMyResources(request, filters = {}) {
    const data = readData(
      await request('/api/app/resource/list', { method: 'POST', body: filters }),
      '加载资源失败'
    )
    return {
      items: data?.items || [],
      total: data?.total || 0,
      page: data?.page || 1,
      pageSize: data?.pageSize || 0
    }
  },

  async getResource(request, id) {
    return readData(
      await request('/api/app/resource/detail', { method: 'POST', body: { id } }),
      '加载资源失败'
    )
  },

  async saveResource(request, payload) {
    return readData(
      await request('/api/app/resource/save', { method: 'POST', body: payload }),
      '保存资源失败'
    )
  },

  async saveVersion(request, payload) {
    return readData(
      await request('/api/app/resource/version-save', { method: 'POST', body: payload }),
      '创建版本失败'
    )
  },

  async submitVersion(request, payload) {
    return readData(
      await request('/api/app/resource/version-submit', { method: 'POST', body: payload }),
      '提交审核失败'
    )
  },

  async deleteResource(request, id) {
    return readData(
      await request('/api/app/resource/delete', { method: 'POST', body: { id } }),
      '删除资源失败'
    )
  },

  // Binary upload cannot go through requestJson (it JSON-encodes every non-string body),
  // so this method posts multipart form data directly.
  async uploadFile(request, { resourceId, file }) {
    const formData = new FormData()
    formData.append('resourceId', resourceId)
    formData.append('file', file, file.name)

    const response = await fetch('/api/app/resource/upload', {
      method: 'POST',
      credentials: 'same-origin',
      body: formData
    })

    let payload = null
    try {
      payload = await response.json()
    } catch {
      payload = null
    }

    if (!response.ok) {
      throw new Error(payload?.message || `上传失败（HTTP ${response.status}）`)
    }

    const data = readData(payload, '上传失败')
    return {
      path: data?.path || '',
      url: data?.url || '',
      name: data?.name || file.name,
      size: data?.size || 0,
      stringSize: data?.stringSize || ''
    }
  }
})
