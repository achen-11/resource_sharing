/* kooboo-app-base:v2; role: forbidden-route-screen */
import { useRouter } from 'vue-router'
import { authService } from '/service.auth.js'

export default {
  name: 'ForbiddenScreen',
  koobooSource: { moduleUrl: import.meta.url },
  setup() {
    const router = useRouter()
    function goHome() {
      // Replace the forbidden entry so Back does not return to it; '/' resolves to the
      // first accessible Screen through the router guard.
      router.replace('/').catch(() => {})
    }
    async function logout() {
      try {
        await authService.logout()
      } catch {
        window.location.assign('/_kooboo/account/login')
      }
    }
    return { goHome, logout }
  },
  template: `
    <section class="app-forbidden-screen" style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 420px; padding: 48px 24px; text-align: center; box-sizing: border-box;">
      <div style="width: 64px; height: 64px; border-radius: 50%; background: #fee2e2; color: #ef4444; display: flex; align-items: center; justify-content: center; margin-bottom: 20px;">
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
        </svg>
      </div>
      <h2 style="margin: 0 0 8px 0; font-size: 20px; font-weight: 600; color: #1f2937;">暂无访问权限</h2>
      <p style="margin: 0 0 24px 0; font-size: 14px; color: #6b7280; max-width: 440px; line-height: 1.6;">
        当前登录账户尚未被分配该页面的访问权限。请联系系统管理员分配权限，或切换其他账户登录。
      </p>
      <div style="display: flex; gap: 12px; align-items: center; justify-content: center;">
        <button type="button" @click="goHome" style="padding: 8px 18px; font-size: 14px; font-weight: 500; border-radius: 6px; border: 1px solid #d1d5db; background: #ffffff; color: #374151; cursor: pointer;">
          返回首页
        </button>
        <button type="button" @click="logout" style="padding: 8px 18px; font-size: 14px; font-weight: 500; border-radius: 6px; border: none; background: #3b82f6; color: #ffffff; cursor: pointer;">
          退出登录
        </button>
      </div>
    </section>
  `
}
