import { defineService } from '/service.http.js'

function readData(payload, fallbackMessage) {
  if (!payload || payload.success !== true) {
    throw new Error(payload?.message || fallbackMessage)
  }
  return payload.data
}

export const categoryService = defineService(import.meta.url, {
  async listCategories(request) {
    const data = readData(await request('/api/app/category'), '加载分类失败')
    return data?.items || []
  },

  async createCategory(request, input) {
    return readData(
      await request('/api/app/category/create', { method: 'POST', body: input }),
      '新建分类失败'
    )
  },

  async updateCategory(request, input) {
    return readData(
      await request('/api/app/category/update', { method: 'POST', body: input }),
      '保存分类失败'
    )
  },

  async deleteCategory(request, id) {
    return readData(
      await request('/api/app/category/delete', { method: 'POST', body: { id } }),
      '删除分类失败'
    )
  }
})
