import { computed, onMounted, ref } from 'vue'
import {
  ElAlert,
  ElButton,
  ElConfigProvider,
  ElDialog,
  ElInput,
  ElMessage,
  ElMessageBox,
  ElOption,
  ElSelect,
  ElTabPane,
  ElTable,
  ElTableColumn,
  ElTabs,
  ElTag,
  KbLucideIcon,
  epZhCn
} from '/element-plus.js'
import { useServices } from '/request-context.js'
import { reviewService } from '/service.review.js'
import { shelfService } from '/service.shelf.js'
import { activityService } from '/service.activity.js'
import { formatDateTime } from '/util.format.js'
import { renderMarkdown } from '/util.markdown.js'
import { copyText } from '/util.clipboard.js'
import { downloadArtifact, versionDownloadUrl } from '/util.download.js'

const STATUS_META = {
  pending: { label: '待审核', type: 'warning' },
  published: { label: '已发布', type: 'success' },
  rejected: { label: '已驳回', type: 'danger' },
  draft: { label: '草稿', type: 'info' }
}

const SCOPE_OPTIONS = [
  { value: '', label: '全部归属' },
  { value: 'public', label: '公共' },
  { value: 'department', label: '部门' },
  { value: 'private', label: '私有' }
]

function scopeLabel(item) {
  if (item.scope === 'public') return '公共'
  if (item.scope === 'department') return item.departmentName ? `部门 · ${item.departmentName}` : '部门'
  return '私有'
}

function renderPrompt(template, detail) {
  const text = String(template || '')
  if (!text.trim() || !detail) {
    return ''
  }
  const map = {
    name: detail.resourceName || '',
    version: `v${detail.versionNo}`,
    artifactUrl:
      detail.deliveryMode === 'hosted' && detail.versionId
        ? versionDownloadUrl(detail.versionId)
        : detail.externalUrl || '',
    category: detail.categoryName || '',
    owner: detail.ownerUserName || ''
  }
  return text.replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (match, key) => (key in map ? map[key] : match))
}

export default {
  name: 'ReviewQueueScreen',
  koobooSource: { moduleUrl: import.meta.url },
  components: {
    ElAlert,
    ElButton,
    ElConfigProvider,
    ElDialog,
    ElInput,
    ElOption,
    ElSelect,
    ElTabPane,
    ElTable,
    ElTableColumn,
    ElTabs,
    ElTag,
    KbLucideIcon
  },
  setup() {
    const { review, shelf, activity } = useServices(import.meta.url, {
      review: reviewService,
      shelf: shelfService,
      activity: activityService
    })

    const activeTab = ref('pending')
    const pending = ref([])
    const handled = ref([])
    const shelfItems = ref([])
    const pendingTotal = ref(0)
    const handledTotal = ref(0)
    const shelfTotal = ref(0)
    const activityVisible = ref(false)
    const activityLoading = ref(false)
    const activityItems = ref([])
    const activityTarget = ref(null)
    const shelfBusyId = ref('')
    const loading = ref(false)
    const loadError = ref('')
    const keyword = ref('')
    const scope = ref('')
    const busyId = ref('')

    const detailVisible = ref(false)
    const detailLoading = ref(false)
    const detail = ref(null)

    const rejectVisible = ref(false)
    const rejectComment = ref('')
    const rejectTarget = ref(null)
    const rejecting = ref(false)

    const detailUsageHtml = computed(() => renderMarkdown(detail.value?.usageGuide || ''))
    const detailIntegrationHtml = computed(() => renderMarkdown(detail.value?.integrationGuide || ''))
    const detailPrompt = computed(() => renderPrompt(detail.value?.quickInstallPrompt, detail.value))

    function statusMeta(value) {
      return STATUS_META[value] || STATUS_META.draft
    }

    async function load() {
      loading.value = true
      loadError.value = ''
      try {
        const [pendingPage, handledPage, shelfPage] = await Promise.all([
          review.listPendingReviews({ keyword: keyword.value.trim(), scope: scope.value }),
          review.listReviewed(),
          shelf.listShelf({ keyword: keyword.value.trim() })
        ])
        pending.value = pendingPage.items
        pendingTotal.value = pendingPage.total
        handled.value = handledPage.items
        handledTotal.value = handledPage.total
        shelfItems.value = shelfPage.items
        shelfTotal.value = shelfPage.total
      } catch (error) {
        loadError.value = error.message || '加载审核台失败'
      } finally {
        loading.value = false
      }
    }

    async function openDetail(row) {
      detailVisible.value = true
      detailLoading.value = true
      detail.value = null
      try {
        detail.value = await review.getReviewDetail(row.versionId)
      } catch (error) {
        ElMessage.error(error.message || '加载详情失败')
        detailVisible.value = false
      } finally {
        detailLoading.value = false
      }
    }

    async function approve(row) {
      try {
        await ElMessageBox.confirm(
          `通过后「${row.resourceName}」的 v${row.versionNo} 会立即上架，使用者可以看到并下载。`,
          '通过并上架',
          { confirmButtonText: '通过', cancelButtonText: '取消', type: 'success' }
        )
      } catch {
        return
      }

      busyId.value = row.versionId
      try {
        await review.approve({ versionId: row.versionId })
        detailVisible.value = false
        await load()
        ElMessage.success('已通过并上架')
      } catch (error) {
        ElMessage.error(error.message || '审核失败')
      } finally {
        busyId.value = ''
      }
    }

    function openReject(row) {
      rejectTarget.value = row
      rejectComment.value = ''
      rejectVisible.value = true
    }

    async function submitReject() {
      const comment = rejectComment.value.trim()
      if (!comment) {
        ElMessage.warning('请填写驳回原因')
        return
      }

      rejecting.value = true
      try {
        await review.reject({ versionId: rejectTarget.value.versionId, comment })
        rejectVisible.value = false
        detailVisible.value = false
        await load()
        ElMessage.success('已驳回，提交人可以看到原因')
      } catch (error) {
        ElMessage.error(error.message || '驳回失败')
      } finally {
        rejecting.value = false
      }
    }

    async function copyDetailPrompt() {
      if (!detailPrompt.value) {
        return
      }
      const copied = await copyText(detailPrompt.value)
      ElMessage[copied ? 'success' : 'warning'](copied ? '已复制 prompt' : '浏览器不允许自动复制，请手动选中复制')
    }

    function shelfMeta(row) {
      return row.shelfStatus === 'listed'
        ? { label: '已上架', type: 'success' }
        : { label: '已下架', type: 'warning' }
    }

    async function setShelfState(row, listed) {
      const label = listed ? '恢复上架' : '下架'
      try {
        await ElMessageBox.confirm(
          listed
            ? `把「${row.name}」的 v${row.publishedVersionNo} 重新放回资源目录？不需要重新审核。`
            : `下架后「${row.name}」会从资源目录消失，维护人需要时再恢复上架。`,
          label,
          { confirmButtonText: label, cancelButtonText: '取消', type: listed ? 'success' : 'warning' }
        )
      } catch {
        return
      }

      shelfBusyId.value = row.id
      try {
        if (listed) {
          await shelf.relist(row.id)
        } else {
          await shelf.unlist(row.id)
        }
        await load()
        ElMessage.success(listed ? '已恢复上架' : '已下架')
      } catch (error) {
        ElMessage.error(error.message || label + '失败')
      } finally {
        shelfBusyId.value = ''
      }
    }

    async function downloadReviewFile() {
      if (!detail.value || !detail.value.versionId) return
      try {
        await downloadArtifact(versionDownloadUrl(detail.value.versionId), detail.value.fileName)
      } catch (error) {
        ElMessage.error(error.message || '下载失败')
      }
    }

    async function openActivity(row) {
      activityTarget.value = row
      activityItems.value = []
      activityVisible.value = true
      activityLoading.value = true
      try {
        activityItems.value = await activity.listActivities(row.id)
      } catch (error) {
        ElMessage.error(error.message || '加载操作记录失败')
      } finally {
        activityLoading.value = false
      }
    }

    onMounted(load)

    return {
      SCOPE_OPTIONS,
      activeTab,
      pending,
      handled,
      shelfItems,
      pendingTotal,
      handledTotal,
      shelfTotal,
      activityVisible,
      activityLoading,
      activityItems,
      activityTarget,
      openActivity,
      shelfBusyId,
      shelfMeta,
      setShelfState,
      loading,
      loadError,
      keyword,
      scope,
      busyId,
      detailVisible,
      detailLoading,
      detail,
      detailUsageHtml,
      detailIntegrationHtml,
      detailPrompt,
      rejectVisible,
      rejectComment,
      rejectTarget,
      rejecting,
      statusMeta,
      scopeLabel,
      load,
      openDetail,
      approve,
      openReject,
      submitReject,
      copyDetailPrompt,
      downloadReviewFile,
      formatDateTime,
      epZhCn
    }
  },
  template: `<ElConfigProvider :locale="epZhCn">
    <section class="screen review-screen">
      <header class="screen-head">
        <div class="screen-head-text">
          <h1 class="screen-title">审核台</h1>
          <p class="screen-subtitle">审核资源版本，管理上架与下架。</p>
        </div>
        <ElButton @click="load">刷新</ElButton>
      </header>

      <ElAlert v-if="loadError" class="screen-alert" type="error" show-icon :closable="false" :title="loadError" />

      <div class="screen-card">
        <ElTabs v-model="activeTab">
          <ElTabPane name="pending">
            <template #label>
              <span>待审核 {{ pending.length }}</span>
            </template>

            <div class="screen-toolbar">
              <ElInput
                v-model="keyword"
                class="screen-toolbar-search"
                placeholder="搜索资源名、简介或提交人"
                clearable
                @keyup.enter="load"
                @clear="load"
              >
                <template #prefix>
                  <KbLucideIcon name="search" :size="16" />
                </template>
              </ElInput>
              <ElSelect v-model="scope" placeholder="归属" style="width: 150px" @change="load">
                <ElOption v-for="item in SCOPE_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
              </ElSelect>
            </div>

            <p v-if="pendingTotal > pending.length" class="form-hint">
              共 {{ pendingTotal }} 条待审，当前只显示最早的 {{ pending.length }} 条，请用筛选缩小范围。
            </p>

            <div v-if="loading" class="screen-loading">正在加载待审资源…</div>

            <ElTable v-else :data="pending" row-key="versionId" style="width: 100%" empty-text="没有待审核的提交">
              <ElTableColumn label="资源" min-width="220">
                <template #default="{ row }">
                  <span class="resource-name">{{ row.resourceName }}</span>
                  <span v-if="row.summary" class="resource-sub">{{ row.summary }}</span>
                </template>
              </ElTableColumn>
              <ElTableColumn label="分类" width="110">
                <template #default="{ row }">{{ row.categoryName || '—' }}</template>
              </ElTableColumn>
              <ElTableColumn label="归属" width="130">
                <template #default="{ row }">
                  <span class="resource-scope">{{ scopeLabel(row) }}</span>
                </template>
              </ElTableColumn>
              <ElTableColumn label="提交" width="150">
                <template #default="{ row }">
                  <span>{{ row.submittedByUserName || row.ownerUserName }}</span>
                  <span class="resource-sub">{{ formatDateTime(row.submittedAt) }}</span>
                </template>
              </ElTableColumn>
              <ElTableColumn label="版本" width="90">
                <template #default="{ row }">v{{ row.versionNo }}</template>
              </ElTableColumn>
              <ElTableColumn label="审核权限" width="140">
                <template #default="{ row }">
                  <span class="member-muted">{{ row.authority }}</span>
                </template>
              </ElTableColumn>
              <ElTableColumn label="操作" width="190" fixed="right" align="right">
                <template #default="{ row }">
                  <ElButton link type="primary" @click="openDetail(row)">详情</ElButton>
                  <ElButton link type="success" :loading="busyId === row.versionId" @click="approve(row)">通过</ElButton>
                  <ElButton link type="danger" @click="openReject(row)">驳回</ElButton>
                </template>
              </ElTableColumn>
            </ElTable>
          </ElTabPane>

          <ElTabPane name="handled">
            <template #label>
              <span>我处理过的 {{ handled.length }}</span>
            </template>

            <p v-if="handledTotal > handled.length" class="form-hint">
              共 {{ handledTotal }} 条已处理记录，当前只显示最近 {{ handled.length }} 条。
            </p>

            <ElTable :data="handled" row-key="versionId" style="width: 100%" empty-text="还没有处理记录">
              <ElTableColumn label="资源" min-width="220">
                <template #default="{ row }">
                  <span class="resource-name">{{ row.resourceName }}</span>
                  <span class="resource-sub">{{ scopeLabel(row) }}</span>
                </template>
              </ElTableColumn>
              <ElTableColumn label="版本" width="80">
                <template #default="{ row }">v{{ row.versionNo }}</template>
              </ElTableColumn>
              <ElTableColumn label="结果" width="100">
                <template #default="{ row }">
                  <ElTag size="small" :type="statusMeta(row.status).type">{{ statusMeta(row.status).label }}</ElTag>
                </template>
              </ElTableColumn>
              <ElTableColumn label="审核意见" min-width="200">
                <template #default="{ row }">{{ row.reviewComment || '—' }}</template>
              </ElTableColumn>
              <ElTableColumn label="处理时间" width="180">
                <template #default="{ row }">
                  <span class="member-muted">{{ formatDateTime(row.reviewedAt) }}</span>
                </template>
              </ElTableColumn>
              <ElTableColumn label="操作" width="90" align="right">
                <template #default="{ row }">
                  <ElButton link type="primary" @click="openDetail(row)">详情</ElButton>
                </template>
              </ElTableColumn>
            </ElTable>
          </ElTabPane>

        <ElTabPane name="shelf">
            <template #label>
              <span>已发布 {{ shelfItems.length }}</span>
            </template>

            <p v-if="shelfTotal > shelfItems.length" class="form-hint">
              共 {{ shelfTotal }} 个已发布资源，当前只显示 {{ shelfItems.length }} 个，请用搜索缩小范围。
            </p>

            <ElTable :data="shelfItems" row-key="id" style="width: 100%" empty-text="没有已发布的资源">
              <ElTableColumn label="资源" min-width="220">
                <template #default="{ row }">
                  <span class="resource-name">{{ row.name }}</span>
                  <span class="resource-sub">
                    {{ row.ownerUserName }}<template v-if="row.summary"> · {{ row.summary }}</template>
                  </span>
                </template>
              </ElTableColumn>
              <ElTableColumn label="分类" width="110">
                <template #default="{ row }">{{ row.categoryName || '—' }}</template>
              </ElTableColumn>
              <ElTableColumn label="归属" width="130">
                <template #default="{ row }">
                  <span class="resource-scope">{{ scopeLabel(row) }}</span>
                </template>
              </ElTableColumn>
              <ElTableColumn label="上架版本" width="90">
                <template #default="{ row }">v{{ row.publishedVersionNo }}</template>
              </ElTableColumn>
              <ElTableColumn label="状态" width="90">
                <template #default="{ row }">
                  <ElTag size="small" :type="shelfMeta(row).type">{{ shelfMeta(row).label }}</ElTag>
                </template>
              </ElTableColumn>
              <ElTableColumn label="我的权限" width="140">
                <template #default="{ row }">
                  <span class="member-muted">{{ row.authority }}</span>
                </template>
              </ElTableColumn>
              <ElTableColumn label="操作" width="180" fixed="right" align="right">
                <template #default="{ row }">
                  <ElButton link type="primary" @click="openActivity(row)">记录</ElButton>
                  <ElButton
                    v-if="row.shelfStatus === 'listed'"
                    link
                    type="warning"
                    :loading="shelfBusyId === row.id"
                    @click="setShelfState(row, false)"
                  >下架</ElButton>
                  <ElButton
                    v-else
                    link
                    type="success"
                    :loading="shelfBusyId === row.id"
                    @click="setShelfState(row, true)"
                  >恢复上架</ElButton>
                </template>
              </ElTableColumn>
            </ElTable>
          </ElTabPane>
        </ElTabs>
      </div>

      <ElDialog v-model="detailVisible" title="审核详情" width="760px" append-to-body>
        <div v-if="detailLoading" class="screen-loading">正在加载详情…</div>
        <div v-else-if="detail">
          <div class="review-info">
            <span><strong>{{ detail.resourceName }}</strong> · v{{ detail.versionNo }}</span>
            <span>分类：{{ detail.categoryName || '—' }}</span>
            <span>归属：{{ scopeLabel(detail) }}</span>
            <span>维护人：{{ detail.ownerUserName }}</span>
          </div>
          <div class="review-info" style="margin-top: 8px">
            <span>提交人：{{ detail.submittedByUserName || detail.ownerUserName }}</span>
            <span>提交时间：{{ formatDateTime(detail.submittedAt) }}</span>
            <span>审核权限：{{ detail.authority }}</span>
          </div>

          <template v-if="detail.summary">
            <h4 class="review-section-title">简介</h4>
            <p class="resource-scope">{{ detail.summary }}</p>
          </template>

          <h4 class="review-section-title">版本内容</h4>
          <div class="review-info">
            <span>变更说明：{{ detail.changelog || '未填写' }}</span>
          </div>
          <p class="resource-scope" style="margin-top: 6px">
            <template v-if="detail.deliveryMode === 'hosted'">
              平台托管文件：
              <ElButton v-if="detail.filePath" link type="primary" @click="downloadReviewFile">
                {{ detail.fileName || '下载文件' }}
              </ElButton>
            </template>
            <template v-else>
              外部链接：
              <a v-if="detail.externalUrl" :href="detail.externalUrl" target="_blank" rel="noopener noreferrer">{{ detail.externalUrl }}</a>
              <span v-else>—</span>
            </template>
          </p>

          <h4 class="review-section-title">使用指南</h4>
          <div class="doc-preview">
            <span v-if="!detailUsageHtml" class="doc-empty">提交人没有填写使用指南</span>
            <div v-else v-html="detailUsageHtml"></div>
          </div>

          <h4 class="review-section-title">接入指南</h4>
          <div class="doc-preview">
            <span v-if="!detailIntegrationHtml" class="doc-empty">提交人没有填写接入指南</span>
            <div v-else v-html="detailIntegrationHtml"></div>
          </div>

          <template v-if="detail.quickInstallEnabled">
            <h4 class="review-section-title">快速安装 prompt</h4>
            <div class="prompt-preview">{{ detailPrompt || '（模板为空）' }}</div>
            <ElButton v-if="detailPrompt" size="small" style="margin-top: 10px" @click="copyDetailPrompt">复制 prompt</ElButton>
          </template>
        </div>

        <template #footer>
          <ElButton @click="detailVisible = false">关闭</ElButton>
          <ElButton
            v-if="detail && detail.status === 'pending'"
            type="danger"
            @click="openReject(detail)"
          >驳回</ElButton>
          <ElButton
            v-if="detail && detail.status === 'pending'"
            type="success"
            :loading="busyId === detail.versionId"
            @click="approve(detail)"
          >通过并上架</ElButton>
        </template>
      </ElDialog>

      <ElDialog v-model="rejectVisible" title="驳回提交" width="520px" append-to-body>
        <p class="resource-scope">
          {{ rejectTarget ? rejectTarget.resourceName + ' · v' + rejectTarget.versionNo : '' }}
        </p>
        <ElInput
          v-model="rejectComment"
          type="textarea"
          :rows="4"
          maxlength="500"
          show-word-limit
          placeholder="写清楚哪里需要修改，提交人会看到这段说明"
        />
        <template #footer>
          <ElButton @click="rejectVisible = false">取消</ElButton>
          <ElButton type="danger" :loading="rejecting" @click="submitReject">确认驳回</ElButton>
        </template>
      </ElDialog>
      <ElDialog v-model="activityVisible" title="上架与变更记录" width="620px" append-to-body>
        <p v-if="activityTarget" class="resource-scope">
          {{ activityTarget.name }} · 上架版本 v{{ activityTarget.publishedVersionNo }}
        </p>
        <div v-if="activityLoading" class="screen-loading">正在加载记录…</div>
        <div v-else-if="activityItems.length === 0" class="empty-state">
          <p>这个资源还没有上架或下架记录。</p>
        </div>
        <ElTable v-else :data="activityItems" row-key="id" style="width: 100%">
          <ElTableColumn label="时间" width="170">
            <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
          </ElTableColumn>
          <ElTableColumn label="操作" width="110">
            <template #default="{ row }">{{ row.actionLabel || row.action }}</template>
          </ElTableColumn>
          <ElTableColumn label="操作人" width="120">
            <template #default="{ row }">{{ row.actorUserName || '—' }}</template>
          </ElTableColumn>
          <ElTableColumn label="身份" min-width="150">
            <template #default="{ row }">{{ row.detail || '—' }}</template>
          </ElTableColumn>
        </ElTable>
        <template #footer>
          <ElButton @click="activityVisible = false">关闭</ElButton>
        </template>
      </ElDialog>
    </section>
  </ElConfigProvider>`
}
