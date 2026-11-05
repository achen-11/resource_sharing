import { defineService } from '/service.http.js'

// Kooboo account sign-in. The server sets the session cookie; the screen reloads
// the document afterwards so the App bootstrap identity is rebuilt.
export const sessionService = defineService(import.meta.url, {
  async signIn(request, { userName, password } = {}) {
    const payload = await request('/api/app/auth/login', {
      method: 'POST',
      body: { userName, password }
    })

    if (!payload || payload.success !== true) {
      throw new Error(payload?.message || '登录失败，请重试')
    }

    return payload.data
  }
})
