import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ElAlert,
  ElButton,
  ElConfigProvider,
  ElMessage,
  ElTable,
  ElTableColumn,
  ElTag,
  KbLucideIcon,
  epZhCn
} from '/element-plus.js'
import { useServices } from '/request-context.js'
import { catalogService } from '/service.catalog.js'
import { tokenService } from '/service.token.js'
import { formatDate, formatDateTime } from '/util.format.js'
import { renderMarkdown } from '/util.markdown.js'
import { copyText } from '/util.clipboard.js'
import { downloadArtifact, versionDownloadUrl } from '/util.download.js'

function scopeLabel(item) {
  if (!item) return ''
  if (item.scope === 'public') return '公共'
  if (item.scope === 'department') return item.departmentName ? `部门 · ${item.departmentName}` : '部门'
  return '私有'
}

function fileSizeText(size) {
  const bytes = Number(size) || 0
  if (bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function downloadUrl(version) {
  if (!version) return ''
  if (version.deliveryMode === 'hosted') {
    const versionId = version.id || version.versionId || ''
    return versionId ? versionDownloadUrl(versionId) : ''
  }
  return version.externalUrl || ''
}

function renderPrompt(template, detail) {
  const text = String(template || '')
  if (!text.trim() || !detail) {
    return ''
  }
  const map = {
    name: detail.name || '',
    version: `v${detail.versionNo}`,
    artifactUrl: downloadUrl(detail),
    category: detail.categoryName || '',
    owner: detail.ownerUserName || ''
  }
  return text.replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (match, key) => (key in map ? map[key] : match))
}

export default {
  name: 'ResourceCatalogDetailScreen',
  koobooSource: { moduleUrl: import.meta.url },
  components: {
    ElAlert,
    ElButton,
    ElConfigProvider,
    ElTable,
    ElTableColumn,
    ElTag,
    KbLucideIcon
  },
  setup() {
    const route = useRoute()
    const router = useRouter()
    const { catalog, token } = useServices(import.meta.url, { catalog: catalogService, token: tokenService })

    const detail = ref(null)
    const loading = ref(false)
    const loadError = ref('')

    const usageHtml = computed(() => renderMarkdown(detail.value?.usageGuide || ''))
    const integrationHtml = computed(() => renderMarkdown(detail.value?.integrationGuide || ''))
    const promptText = computed(() => renderPrompt(detail.value?.quickInstallPrompt, detail.value))
    const tags = computed(() =>
      String(detail.value?.tags || '')
        .split(/[,，]/)
        .map(item => item.trim())
        .filter(Boolean)
    )
    const canDownloadCurrent = computed(
      () => Boolean(detail.value && detail.value.deliveryMode === 'hosted' && detail.value.versionId)
    )
    const currentExternalUrl = computed(() =>
      detail.value && detail.value.deliveryMode !== 'hosted' ? detail.value.externalUrl || '' : ''
    )
    const downloadBusy = ref(false)
    const linkBusy = ref(false)
    const downloadLink = ref(null)

    async function load() {
      const id = String(route.params.id || '')
      if (!id) {
        loadError.value = '资源标识缺失'
        return
      }
      loading.value = true
      loadError.value = ''
      try {
        detail.value = await catalog.getCatalogItem(id)
      } catch (error) {
        detail.value = null
        loadError.value = error.message || '加载资源详情失败'
      } finally {
        loading.value = false
      }
    }

    async function copyPrompt() {
      if (!promptText.value) return
      const copied = await copyText(promptText.value)
      ElMessage[copied ? 'success' : 'warning'](copied ? '已复制 prompt' : '浏览器不允许自动复制，请手动选中复制')
    }

    async function downloadCurrent() {
      if (!canDownloadCurrent.value) return
      downloadBusy.value = true
      try {
        await downloadArtifact(versionDownloadUrl(detail.value.versionId), detail.value.fileName)
      } catch (error) {
        ElMessage.error(error.message || '下载失败')
      } finally {
        downloadBusy.value = false
      }
    }

    async function downloadVersion(row) {
      if (!row || !row.id) return
      try {
        await downloadArtifact(versionDownloadUrl(row.id), row.fileName)
      } catch (error) {
        ElMessage.error(error.message || '下载失败')
      }
    }

    async function createLink() {
      if (!detail.value || !detail.value.versionId) return
      linkBusy.value = true
      try {
        const result = await token.createDownloadToken({ versionId: detail.value.versionId, hours: 72 })
        downloadLink.value = { url: `${window.location.origin}${result.url}`, expiresAt: result.expiresAt }
      } catch (error) {
        ElMessage.error(error.message || '生成下载链接失败')
      } finally {
        linkBusy.value = false
      }
    }

    async function copyLink() {
      if (!downloadLink.value) return
      const copied = await copyText(downloadLink.value.url)
      ElMessage[copied ? 'success' : 'warning'](copied ? '已复制下载链接' : '浏览器不允许自动复制，请手动选中复制')
    }

    function goBack() {
      router.push('/catalog')
    }

    function copyCurrentUrl() {
      copyText(window.location.href).then(copied => {
        ElMessage[copied ? 'success' : 'warning'](copied ? '已复制详情链接' : '浏览器不允许自动复制')
      })
    }

    onMounted(load)
    watch(() => route.params.id, load)

    return {
      detail,
      loading,
      loadError,
      usageHtml,
      integrationHtml,
      promptText,
      tags,
      canDownloadCurrent,
      currentExternalUrl,
      downloadBusy,
      linkBusy,
      downloadLink,
      createLink,
      copyLink,
      downloadCurrent,
      downloadVersion,
      load,
      copyPrompt,
      goBack,
      copyCurrentUrl,
      scopeLabel,
      fileSizeText,
      downloadUrl,
      formatDate,
      formatDateTime,
      epZhCn
    }
  },
  template: `<ElConfigProvider :locale="epZhCn">
    <section class="screen catalog-detail-screen">
      <header class="screen-head">
        <div class="screen-head-text">
          <h1 class="screen-title">{{ detail ? detail.name : '资源详情' }}</h1>
          <p class="screen-subtitle">{{ detail ? detail.summary || '这个资源还没有填写简介' : '正在加载…' }}</p>
        </div>
        <div class="screen-head-actions">
          <ElButton @click="goBack">
            <KbLucideIcon name="arrow-left" :size="16" class="btn-icon" />返回目录
          </ElButton>
          <ElButton v-if="detail" @click="copyCurrentUrl">复制链接</ElButton>
        </div>
      </header>

      <ElAlert v-if="loadError" class="screen-alert" type="error" show-icon :closable="false" :title="loadError" />

      <div v-if="loading" class="screen-loading">正在加载资源详情…</div>

      <template v-else-if="detail">
        <div class="screen-card">
          <div class="review-info">
            <span>分类：{{ detail.categoryName || '未分类' }}</span>
            <span>归属：{{ scopeLabel(detail) }}</span>
            <span>维护人：{{ detail.ownerUserName }}</span>
            <span>当前版本：v{{ detail.versionNo }}</span>
            <span>更新：{{ formatDate(detail.updatedAt) }}</span>
            <span>下载 {{ detail.downloadCount }} 次</span>
          </div>

          <div v-if="tags.length" class="catalog-tags" style="margin-top: 10px">
            <span v-for="tag in tags" :key="tag" class="catalog-tag">{{ tag }}</span>
          </div>

          <div class="catalog-download" style="margin-top: 14px">
            <strong>v{{ detail.versionNo }}</strong>
            <span>{{ detail.changelog || '本次更新没有写说明' }}</span>
            <span v-if="fileSizeText(detail.fileSize)" class="member-muted">{{ fileSizeText(detail.fileSize) }}</span>
            <span class="catalog-download-actions">
              <ElButton
                v-if="canDownloadCurrent"
                type="primary"
                size="small"
                :loading="downloadBusy"
                @click="downloadCurrent"
              >下载</ElButton>
              <a
                v-else-if="currentExternalUrl"
                class="el-button el-button--primary el-button--small"
                :href="currentExternalUrl"
                target="_blank"
                rel="noopener noreferrer"
              >打开外部地址</a>
              <span v-else class="member-muted">当前版本还没有可下载的地址</span>
            </span>
          </div>
          <div v-if="canDownloadCurrent" class="token-row">
            <ElButton size="small" :loading="linkBusy" @click="createLink">生成 AI 下载链接</ElButton>
            <span class="form-hint">给本机 AI 或脚本用，72 小时内有效；资源下架后链接立即失效。</span>
          </div>
          <div v-if="downloadLink" class="token-result">
            <code class="token-url">{{ downloadLink.url }}</code>
            <ElButton size="small" @click="copyLink">复制</ElButton>
            <span class="member-muted">有效期至 {{ formatDateTime(downloadLink.expiresAt) }}</span>
          </div>
        </div>

        <div v-if="detail.quickInstallEnabled" class="screen-card" style="margin-top: 16px">
          <div class="doc-toolbar">
            <span class="resource-name">快速安装 prompt</span>
            <ElButton v-if="promptText" size="small" @click="copyPrompt">复制</ElButton>
          </div>
          <p class="form-hint">复制后贴到你本机的 AI 环境里，它会按这个说明把资源装好。</p>
          <div class="prompt-preview">{{ promptText || '维护人还没有填写 prompt 模板' }}</div>
        </div>

        <div class="screen-card" style="margin-top: 16px">
          <div class="doc-toolbar">
            <span class="resource-name">使用指南</span>
          </div>
          <div class="doc-preview">
            <span v-if="!usageHtml" class="doc-empty">维护人还没有填写使用指南</span>
            <div v-else v-html="usageHtml"></div>
          </div>
        </div>

        <div class="screen-card" style="margin-top: 16px">
          <div class="doc-toolbar">
            <span class="resource-name">接入指南</span>
          </div>
          <div class="doc-preview">
            <span v-if="!integrationHtml" class="doc-empty">维护人还没有填写接入指南</span>
            <div v-else v-html="integrationHtml"></div>
          </div>
        </div>

        <div class="screen-card" style="margin-top: 16px">
          <div class="doc-toolbar">
            <span class="resource-name">已发布版本</span>
          </div>
          <ElTable :data="detail.versions" row-key="versionNo" style="width: 100%" empty-text="还没有已发布版本">
            <ElTableColumn label="版本" width="90">
              <template #default="{ row }">v{{ row.versionNo }}</template>
            </ElTableColumn>
            <ElTableColumn label="更新说明" min-width="220">
              <template #default="{ row }">{{ row.changelog || '—' }}</template>
            </ElTableColumn>
            <ElTableColumn label="大小" width="100">
              <template #default="{ row }">{{ fileSizeText(row.fileSize) || '—' }}</template>
            </ElTableColumn>
            <ElTableColumn label="发布时间" width="170">
              <template #default="{ row }">
                <span class="member-muted">{{ formatDateTime(row.reviewedAt) }}</span>
              </template>
            </ElTableColumn>
            <ElTableColumn label="操作" width="120" align="right">
              <template #default="{ row }">
                <ElButton
                  v-if="row.deliveryMode === 'hosted'"
                  link
                  type="primary"
                  @click="downloadVersion(row)"
                >下载</ElButton>
                <a
                  v-else-if="row.externalUrl"
                  class="catalog-link"
                  :href="row.externalUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                >打开</a>
                <span v-else class="member-muted">—</span>
              </template>
            </ElTableColumn>
          </ElTable>
        </div>
      </template>
    </section>
  </ElConfigProvider>`
}
