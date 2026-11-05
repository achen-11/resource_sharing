import { defineService } from '/service.http.js'

function readData(payload, fallbackMessage) {
  if (!payload || payload.success !== true) {
    throw new Error(payload?.message || fallbackMessage)
  }
  return payload.data
}

export const memberService = defineService(import.meta.url, {
  async listMembers(request) {
    const data = readData(await request('/api/app/members'), '加载成员失败')
    return {
      roles: data?.roles || [],
      items: data?.items || [],
      currentUserId: data?.currentUserId || ''
    }
  },

  async assignRole(request, { koobooUserId, roleCode }) {
    return readData(
      await request('/api/app/members/assign-role', {
        method: 'POST',
        body: { koobooUserId, roleCode }
      }),
      '保存角色失败'
    )
  }
})
