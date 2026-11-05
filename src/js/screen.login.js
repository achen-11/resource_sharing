import { computed, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import {
  ElAlert,
  ElButton,
  ElConfigProvider,
  ElForm,
  ElFormItem,
  ElInput,
  KbLucideIcon,
  epZhCn
} from '/element-plus.js'
import { useServices } from '/request-context.js'
import { sessionService } from '/service.session.js'

export default {
  name: 'LoginScreen',
  koobooSource: { moduleUrl: import.meta.url },
  components: { ElAlert, ElButton, ElConfigProvider, ElForm, ElFormItem, ElInput, KbLucideIcon },
  setup() {
    const route = useRoute()
    const { session } = useServices(import.meta.url, { session: sessionService })

    const formRef = ref(null)
    const form = reactive({ userName: '', password: '' })
    const rules = {
      userName: [{ required: true, message: '请输入账号', trigger: 'blur' }],
      password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
    }
    const submitting = ref(false)
    const errorMessage = ref('')

    const returnPath = computed(() => {
      const value = Array.isArray(route.query.returnUrl) ? route.query.returnUrl[0] : route.query.returnUrl
      if (typeof value !== 'string') return ''
      if (!value.startsWith('/') || value.startsWith('//')) return ''
      if (value.startsWith('/login')) return ''
      return value
    })

    function enterApp() {
      const target = returnPath.value || '/'
      // The sign-in response set the session cookie on the server; a full document
      // load rebuilds the App bootstrap identity before routing into the target hash.
      window.location.assign(`${window.location.pathname}?signed-in=1#${target}`)
    }

    async function submit() {
      if (submitting.value) return
      errorMessage.value = ''

      try {
        await formRef.value.validate()
      } catch {
        return
      }

      submitting.value = true
      try {
        await session.signIn({ userName: form.userName.trim(), password: form.password })
        enterApp()
      } catch (error) {
        errorMessage.value = error.message || '登录失败，请重试'
      } finally {
        submitting.value = false
      }
    }

    return { form, rules, formRef, submitting, errorMessage, epZhCn, submit }
  },
  template: `<ElConfigProvider :locale="epZhCn">
    <main class="login-page">
      <section class="login-brand">
        <div class="cpr-brand">
          <span class="cpr-brand-mark"><KbLucideIcon name="boxes" :size="26" /></span>
          <span class="cpr-brand-name">Kooboo<span>资源共享平台</span></span>
        </div>
        <h1 class="login-brand-title">让团队的好资源，<br>被更多人用起来。</h1>
        <p class="login-brand-lead">统一登记、查找和分发 Skill、模块包、模板与代码块。</p>
        <ul class="login-brand-points">
          <li><KbLucideIcon name="package" :size="16" aria-hidden="true" /><span>四类资源统一登记，按部门归口</span></li>
          <li><KbLucideIcon name="shield-check" :size="16" aria-hidden="true" /><span>部门审核后上架，每个版本留痕可回溯</span></li>
          <li><KbLucideIcon name="download" :size="16" aria-hidden="true" /><span>下载与安装都有记录，热度看得见</span></li>
        </ul>
      </section>
      <section class="login-panel">
        <div class="login-card">
          <h2 class="login-card-title">登录资源共享平台</h2>
          <p class="login-card-hint">使用你的 Kooboo 组织账号继续</p>
          <ElAlert v-if="errorMessage" :title="errorMessage" type="error" show-icon :closable="false" class="login-alert" />
          <ElForm ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="submit">
            <ElFormItem label="账号" prop="userName">
              <ElInput v-model="form.userName" size="large" autocomplete="username" aria-label="账号" placeholder="请输入账号" />
            </ElFormItem>
            <ElFormItem label="密码" prop="password">
              <ElInput
                v-model="form.password"
                type="password"
                size="large"
                show-password
                autocomplete="current-password"
                aria-label="密码"
                placeholder="请输入密码"
                @keyup.enter="submit"
              />
            </ElFormItem>
            <ElButton type="primary" size="large" class="login-submit" :loading="submitting" @click="submit">
              {{ submitting ? '正在登录' : '登录' }}
            </ElButton>
          </ElForm>
          <p class="login-card-footnote">账号由平台组织统一维护，忘记密码请联系平台管理员。</p>
        </div>
      </section>
    </main>
  </ElConfigProvider>`
}
