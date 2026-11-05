import { computed, inject, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ElAlert,
  ElButton,
  ElConfigProvider,
  ElDialog,
  ElForm,
  ElFormItem,
  ElInput,
  ElMessage,
  ElMessageBox,
  ElOption,
  ElSelect,
  ElSwitch,
  ElTabPane,
  ElTable,
  ElTableColumn,
  ElTabs,
  ElTag,
  ElTreeSelect,
  ElUpload,
  KbLucideIcon,
  epZhCn
} from '/element-plus.js'
import { useServices } from '/request-context.js'
import { categoryService } from '/service.category.js'
import { resourceService } from '/service.resource.js'
import { formatDateTime } from '/util.format.js'
import { renderMarkdown } from '/util.markdown.js'
import { copyText } from '/util.clipboard.js'
import { downloadArtifact, uploadCheckUrl, versionDownloadUrl } from '/util.download.js'

const STATUS_META = {
  none: { label: '未提交', type: 'info' },
  draft: { label: '草稿', type: 'info' },
  pending: { label: '审核中', type: 'warning' },
  published: { label: '已发布', type: 'success' },
  rejected: { label: '已驳回', type: 'danger' }
}

const SELECT_PROPS = { label: 'name', children: 'children' }
const PLACEHOLDERS = ['{{name}}', '{{version}}', '{{artifactUrl}}', '{{category}}', '{{owner}}']
const PROMPT_PLACEHOLDER = '请把 {{name}}（版本 v{{version}}）安装到本机，资源地址：{{artifactUrl}}'
const SCOPE_OPTIONS = [
  { value: 'private', label: '私有', hint: '只有自己可见' },
  { value: 'department', label: '部门', hint: '同部门成员可见' },
  { value: 'public', label: '公共', hint: '全平台可见' }
]

function emptyForm() {
  return {
    name: '',
    summary: '',
    categoryId: '',
    scope: 'private',
    departmentId: '',
    tags: '',
    usageGuide: '',
    integrationGuide: '',
    quickInstallEnabled: false,
    quickInstallPrompt: ''
  }
}

function findTrail(nodes, id, trail) {
  for (const node of nodes || []) {
    const next = trail.concat([node.name])
    if (node.id === id) {
      return next
    }
    const found = findTrail(node.children, id, next)
    if (found) {
      return found
    }
  }
  return null
}

export default {
  name: 'ResourceEditScreen',
  koobooSource: { moduleUrl: import.meta.url },
  components: {
    ElAlert,
    ElButton,
    ElConfigProvider,
    ElDialog,
    ElForm,
    ElFormItem,
    ElInput,
    ElOption,
    ElSelect,
    ElSwitch,
    ElTabPane,
    ElTable,
    ElTableColumn,
    ElTabs,
    ElTag,
    ElTreeSelect,
    ElUpload,
    KbLucideIcon
  },
  setup() {
    const route = useRoute()
    const router = useRouter()
    const bootstrap = inject('app.bootstrap', { user: null })
    const { resource, category } = useServices(import.meta.url, {
      resource: resourceService,
      category: categoryService
    })

    const resourceId = computed(() => String(route.params.id || ''))
    const isNew = computed(() => !resourceId.value)

    const form = reactive(emptyForm())
    const meta = ref(null)
    const versions = ref([])
    const categories = ref([])
    const departments = ref([])
    const loading = ref(false)
    const loadError = ref('')
    const saving = ref(false)
    const activeTab = ref('basic')
    const usageMode = ref('edit')
    const integrationMode = ref('edit')
    const versionDialogVisible = ref(false)
    const versionSaving = ref(false)
    const submitting = ref(false)
    const versionForm = reactive({
      deliveryMode: 'external',
      externalUrl: '',
      changelog: '',
      filePath: '',
      fileName: '',
      fileUrl: '',
      fileSize: 0,
      uploading: false
    })

    const categoryPath = computed(() => {
      const trail = findTrail(categories.value, form.categoryId, [])
      return trail ? trail.join(' / ') : ''
    })

    const scopeHint = computed(() => {
      if (form.scope === 'public') return '全平台可见'
      if (form.scope === 'department') return '同部门成员可见'
      return '只有自己可见'
    })

    const latestVersion = computed(() => (versions.value.length > 0 ? versions.value[0] : null))

    const artifactUrl = computed(() => {
      const latest = latestVersion.value
      if (!latest) return ''
      if (latest.deliveryMode === 'hosted') {
        return latest.id ? versionDownloadUrl(latest.id) : ''
      }
      return latest.externalUrl || ''
    })

    const promptPreview = computed(() => {
      const template = form.quickInstallPrompt || ''
      if (!template.trim()) {
        return ''
      }
      const map = {
        name: form.name || '',
        version: latestVersion.value ? `v${latestVersion.value.versionNo}` : '',
        artifactUrl: artifactUrl.value,
        category: categoryPath.value,
        owner: meta.value ? meta.value.ownerUserName : (bootstrap.user?.displayName || '')
      }
      return template.replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (match, key) => (key in map ? map[key] : match))
    })

    const usageHtml = computed(() => renderMarkdown(form.usageGuide))
    const integrationHtml = computed(() => renderMarkdown(form.integrationGuide))

    function statusMeta(value) {
      return STATUS_META[value] || STATUS_META.none
    }

    function applyItem(item, resetForm) {
      meta.value = {
        ownerUserName: item.ownerUserName,
        latestVersionNo: item.latestVersionNo,
        latestVersionStatus: item.latestVersionStatus,
        versionCount: item.versionCount,
        updatedAt: item.updatedAt,
        categoryName: item.categoryName
      }
      versions.value = item.versions || []
      if (resetForm) {
        Object.assign(form, {
          name: item.name,
          summary: item.summary,
          categoryId: item.categoryId,
          scope: item.scope || 'private',
          departmentId: item.departmentId || '',
          tags: item.tags,
          usageGuide: item.usageGuide || '',
          integrationGuide: item.integrationGuide || '',
          quickInstallEnabled: item.quickInstallEnabled === true,
          quickInstallPrompt: item.quickInstallPrompt || ''
        })
      }
    }

    async function reloadDetail() {
      if (isNew.value) {
        return
      }
      const item = await resource.getResource(resourceId.value)
      applyItem(item, false)
    }

    async function load() {
      loading.value = true
      loadError.value = ''
      try {
        const [tree, options] = await Promise.all([category.listCategories(), resource.getMeta()])
        categories.value = tree
        departments.value = options.departments || []

        if (isNew.value) {
          Object.assign(form, emptyForm())
          meta.value = null
          versions.value = []
          if (departments.value.length === 1) {
            form.departmentId = departments.value[0].id
          }
        } else {
          const item = await resource.getResource(resourceId.value)
          applyItem(item, true)
        }
      } catch (error) {
        loadError.value = error.message || '加载资源失败'
      } finally {
        loading.value = false
      }
    }

    function goBack() {
      router.push('/my-resources')
    }

    async function save() {
      if (saving.value) {
        return false
      }
      if (!form.name.trim()) {
        activeTab.value = 'basic'
        ElMessage.warning('请输入资源名称')
        return false
      }
      if (!form.categoryId) {
        activeTab.value = 'basic'
        ElMessage.warning('请选择资源分类')
        return false
      }
      if (form.scope === 'department' && !form.departmentId) {
        activeTab.value = 'basic'
        ElMessage.warning('部门范围需要选择一个部门')
        return false
      }

      saving.value = true
      try {
        const saved = await resource.saveResource({
          id: isNew.value ? '' : resourceId.value,
          name: form.name.trim(),
          summary: form.summary.trim(),
          categoryId: form.categoryId,
          scope: form.scope,
          departmentId: form.scope === 'department' ? form.departmentId : '',
          tags: form.tags.trim(),
          usageGuide: form.usageGuide,
          integrationGuide: form.integrationGuide,
          quickInstallEnabled: form.quickInstallEnabled,
          quickInstallPrompt: form.quickInstallPrompt
        })

        if (isNew.value) {
          await router.replace(`/my-resources/${saved.id}`)
          await load()
        } else {
          await reloadDetail()
        }
        ElMessage.success('已保存')
        return true
      } catch (error) {
        ElMessage.error(error.message || '保存失败')
        return false
      } finally {
        saving.value = false
      }
    }

    async function openVersionDialog() {
      if (isNew.value) {
        ElMessage.warning('先保存资源，再创建版本')
        return
      }
      Object.assign(versionForm, {
        deliveryMode: 'external',
        externalUrl: '',
        changelog: '',
        filePath: '',
        fileName: '',
        fileUrl: '',
        fileSize: 0,
        uploading: false
      })
      versionDialogVisible.value = true
    }

    async function createVersion() {
      const isHosted = versionForm.deliveryMode === 'hosted'
      if (isHosted) {
        if (!versionForm.filePath) {
          ElMessage.warning('请先上传资源文件')
          return
        }
      } else if (!versionForm.externalUrl.trim()) {
        ElMessage.warning('请填写资源地址')
        return
      }

      versionSaving.value = true
      try {
        const payload = {
          resourceId: resourceId.value,
          deliveryMode: versionForm.deliveryMode,
          changelog: versionForm.changelog.trim()
        }
        if (isHosted) {
          payload.filePath = versionForm.filePath
          payload.fileName = versionForm.fileName
          payload.fileSize = versionForm.fileSize
        } else {
          payload.externalUrl = versionForm.externalUrl.trim()
        }

        await resource.saveVersion(payload)
        versionDialogVisible.value = false
        await reloadDetail()
        ElMessage.success('版本已创建，可以提交审核了')
      } catch (error) {
        ElMessage.error(error.message || '创建版本失败')
      } finally {
        versionSaving.value = false
      }
    }

    async function uploadFile(options) {
      versionForm.uploading = true
      try {
        const stored = await resource.uploadFile({ resourceId: resourceId.value, file: options.file })
        versionForm.filePath = stored.path
        versionForm.fileName = stored.name
        versionForm.fileUrl = stored.url
        versionForm.fileSize = stored.size
        options.onSuccess?.(stored)
        ElMessage.success(`已上传 ${stored.name}`)
      } catch (error) {
        options.onError?.(error)
        ElMessage.error(error.message || '上传失败')
      } finally {
        versionForm.uploading = false
      }
    }

    async function submitLatest() {
      const latest = latestVersion.value
      if (!latest) {
        ElMessage.warning('还没有可提交的版本')
        return
      }
      try {
        await ElMessageBox.confirm(
          `提交 v${latest.versionNo} 后由审核人处理，审核期间不能改版本内容。`,
          '提交审核',
          { confirmButtonText: '提交', cancelButtonText: '取消', type: 'info' }
        )
      } catch {
        return
      }

      submitting.value = true
      try {
        await resource.submitVersion({ resourceId: resourceId.value })
        await reloadDetail()
        ElMessage.success('已提交审核')
      } catch (error) {
        ElMessage.error(error.message || '提交失败')
      } finally {
        submitting.value = false
      }
    }

    function insertToken(token) {
      form.quickInstallPrompt = `${form.quickInstallPrompt || ''}${token}`
    }

    async function copyPrompt() {
      if (!promptPreview.value) {
        ElMessage.warning('先填写 prompt 模板')
        return
      }
      const copied = await copyText(promptPreview.value)
      if (copied) {
        ElMessage.success('已复制，粘贴到你本机的 AI 环境即可')
      } else {
        ElMessage.warning('浏览器不允许自动复制，请手动选中文本复制')
      }
    }

    async function downloadVersionFile(row) {
      if (!row || !row.id) return
      try {
        await downloadArtifact(versionDownloadUrl(row.id), row.fileName)
      } catch (error) {
        ElMessage.error(error.message || '下载失败')
      }
    }

    async function downloadUploadCheck() {
      if (!versionForm.filePath || !resourceId.value) return
      try {
        await downloadArtifact(uploadCheckUrl(versionForm.filePath, resourceId.value), versionForm.fileName)
      } catch (error) {
        ElMessage.error(error.message || '下载失败')
      }
    }

    onMounted(load)

    return {
      SELECT_PROPS,
      PLACEHOLDERS,
      PROMPT_PLACEHOLDER,
      SCOPE_OPTIONS,
      isNew,
      form,
      meta,
      versions,
      categories,
      departments,
      loading,
      loadError,
      saving,
      activeTab,
      usageMode,
      integrationMode,
      versionDialogVisible,
      versionSaving,
      submitting,
      versionForm,
      categoryPath,
      scopeHint,
      latestVersion,
      artifactUrl,
      promptPreview,
      usageHtml,
      integrationHtml,
      statusMeta,
      applyItem,
      load,
      goBack,
      save,
      openVersionDialog,
      createVersion,
      uploadFile,
      submitLatest,
      insertToken,
      copyPrompt,
      downloadVersionFile,
      downloadUploadCheck,
      formatDateTime,
      epZhCn
    }
  },
  template: `<ElConfigProvider :locale="epZhCn">
    <section class="screen resource-edit-screen">
      <header class="screen-head">
        <div class="screen-head-text">
          <h1 class="screen-title">{{ isNew ? '登记资源' : (form.name || '编辑资源') }}</h1>
          <p class="screen-subtitle">
            <template v-if="isNew">先把基础信息填完保存，再创建第一个版本送审。</template>
            <template v-else>
              {{ categoryPath || '未选分类' }} · 归属 {{ form.scope === 'public' ? '公共' : (form.scope === 'department' ? '部门' : '私有') }}
              <template v-if="meta"> · 维护人 {{ meta.ownerUserName }}</template>
            </template>
          </p>
        </div>
        <div class="screen-head-actions">
          <ElButton @click="goBack">返回列表</ElButton>
          <ElButton type="primary" :loading="saving" @click="save">保存</ElButton>
        </div>
      </header>

      <ElAlert v-if="loadError" class="screen-alert" type="error" show-icon :closable="false" :title="loadError" />

      <div v-if="loading" class="screen-loading">正在加载资源…</div>

      <div v-else class="screen-card">
        <ElTabs v-model="activeTab">
          <ElTabPane label="基础信息" name="basic">
            <ElForm label-position="top" class="resource-basics-form">
              <ElFormItem label="资源名称">
                <ElInput v-model="form.name" maxlength="80" show-word-limit placeholder="例如：Kooboo 数据同步 Skill" />
              </ElFormItem>
              <ElFormItem label="一句话简介">
                <ElInput v-model="form.summary" maxlength="300" show-word-limit placeholder="解决什么问题，适合谁用" />
              </ElFormItem>
              <ElFormItem label="分类">
                <ElTreeSelect
                  v-model="form.categoryId"
                  :data="categories"
                  node-key="id"
                  :props="SELECT_PROPS"
                  check-strictly
                  clearable
                  :render-after-expand="false"
                  placeholder="从分类树里选一个节点"
                  style="width: 100%"
                />
                <span class="form-hint">分类树由「分类管理」维护，这里只能选已有节点。</span>
              </ElFormItem>
              <ElFormItem label="归属范围">
                <ElSelect v-model="form.scope" style="width: 100%">
                  <ElOption v-for="option in SCOPE_OPTIONS" :key="option.value" :label="option.label" :value="option.value" />
                </ElSelect>
                <span class="form-hint">{{ scopeHint }}</span>
              </ElFormItem>
              <ElFormItem v-if="form.scope === 'department'" label="归属部门">
                <ElSelect v-model="form.departmentId" placeholder="选择你所在的部门" style="width: 100%">
                  <ElOption v-for="item in departments" :key="item.id" :label="item.name" :value="item.id" />
                </ElSelect>
                <span v-if="departments.length === 0" class="form-hint">你还没有加入任何部门，无法选择部门范围。</span>
              </ElFormItem>
              <ElFormItem label="标签">
                <ElInput v-model="form.tags" maxlength="120" show-word-limit placeholder="用英文逗号分隔，例如：sql, 数据同步" />
              </ElFormItem>
            </ElForm>
          </ElTabPane>

          <ElTabPane label="使用指南" name="usage">
            <div class="doc-toolbar">
              <ElButton size="small" :type="usageMode === 'edit' ? 'primary' : ''" @click="usageMode = 'edit'">编辑</ElButton>
              <ElButton size="small" :type="usageMode === 'preview' ? 'primary' : ''" @click="usageMode = 'preview'">预览</ElButton>
              <span class="form-hint">支持 Markdown：# 标题、- 列表、**加粗**、代码块、[链接](https://…)</span>
            </div>
            <ElInput
              v-if="usageMode === 'edit'"
              v-model="form.usageGuide"
              type="textarea"
              :rows="18"
              placeholder="这个资源怎么用：适用场景、关键步骤、注意事项"
            />
            <div v-else class="doc-preview">
              <span v-if="!usageHtml" class="doc-empty">还没有内容</span>
              <div v-else v-html="usageHtml"></div>
            </div>
          </ElTabPane>

          <ElTabPane label="接入指南" name="integration">
            <div class="doc-toolbar">
              <ElButton size="small" :type="integrationMode === 'edit' ? 'primary' : ''" @click="integrationMode = 'edit'">编辑</ElButton>
              <ElButton size="small" :type="integrationMode === 'preview' ? 'primary' : ''" @click="integrationMode = 'preview'">预览</ElButton>
              <span class="form-hint">写清楚怎么装进已有项目：依赖、命令、配置项、验证方式</span>
            </div>
            <ElInput
              v-if="integrationMode === 'edit'"
              v-model="form.integrationGuide"
              type="textarea"
              :rows="18"
              placeholder="把这个资源接入现有项目的步骤"
            />
            <div v-else class="doc-preview">
              <span v-if="!integrationHtml" class="doc-empty">还没有内容</span>
              <div v-else v-html="integrationHtml"></div>
            </div>
          </ElTabPane>

          <ElTabPane label="快速安装" name="prompt">
            <ElForm label-position="top" style="max-width: 820px">
              <ElFormItem label="允许快速安装">
                <ElSwitch v-model="form.quickInstallEnabled" />
                <span class="form-hint">开启后，使用者可以直接复制一段 prompt 交给本机 AI 环境安装</span>
              </ElFormItem>
              <template v-if="form.quickInstallEnabled">
                <ElFormItem label="prompt 模板">
                  <ElInput
                    v-model="form.quickInstallPrompt"
                    type="textarea"
                    :rows="6"
                    maxlength="4000"
                    show-word-limit
                    :placeholder="PROMPT_PLACEHOLDER"
                  />
                  <div class="prompt-tokens">
                    <ElButton v-for="token in PLACEHOLDERS" :key="token" size="small" text type="primary" @click="insertToken(token)">
                      {{ token }}
                    </ElButton>
                  </div>
                  <span class="form-hint">占位符会按当前版本自动替换：name、version、artifactUrl、category、owner</span>
                </ElFormItem>
                <ElFormItem label="复制后实际得到的文本">
                  <div class="prompt-preview">{{ promptPreview || '（填写模板后这里显示最终文本）' }}</div>
                  <ElButton style="margin-top: 10px" :disabled="!promptPreview" @click="copyPrompt">
                    <KbLucideIcon name="copy" :size="16" class="btn-icon" />复制 prompt
                  </ElButton>
                </ElFormItem>
              </template>
            </ElForm>
          </ElTabPane>

          <ElTabPane label="版本" name="versions">
            <ElAlert
              v-if="isNew"
              class="screen-alert"
              type="info"
              show-icon
              :closable="false"
              title="先保存基础信息，才能创建第一个版本。"
            />
            <template v-else>
              <div class="screen-toolbar">
                <span class="screen-counter">共 {{ versions.length }} 个版本</span>
                <ElButton size="small" type="primary" @click="openVersionDialog">新建版本</ElButton>
                <ElButton
                  v-if="latestVersion && (latestVersion.status === 'draft' || latestVersion.status === 'rejected')"
                  size="small"
                  :loading="submitting"
                  @click="submitLatest"
                >
                  提交 v{{ latestVersion.versionNo }} 审核
                </ElButton>
              </div>

              <ElTable :data="versions" row-key="id" style="width: 100%" empty-text="还没有版本">
                <ElTableColumn label="版本" width="90">
                  <template #default="{ row }">v{{ row.versionNo }}</template>
                </ElTableColumn>
                <ElTableColumn label="状态" width="100">
                  <template #default="{ row }">
                    <ElTag size="small" :type="statusMeta(row.status).type">{{ statusMeta(row.status).label }}</ElTag>
                  </template>
                </ElTableColumn>
                <ElTableColumn label="分发方式" width="110">
                  <template #default="{ row }">{{ row.deliveryMode === 'hosted' ? '平台托管' : '外部链接' }}</template>
                </ElTableColumn>
                <ElTableColumn label="地址" min-width="220">
                  <template #default="{ row }">
                    <a v-if="row.externalUrl" :href="row.externalUrl" target="_blank" rel="noopener noreferrer">{{ row.externalUrl }}</a>
                    <ElButton v-else-if="row.filePath" link type="primary" @click="downloadVersionFile(row)">
                      {{ row.fileName || '下载文件' }}
                    </ElButton>
                    <span v-else class="member-muted">—</span>
                  </template>
                </ElTableColumn>
                <ElTableColumn label="变更说明" min-width="180">
                  <template #default="{ row }">
                    <span>{{ row.changelog || '—' }}</span>
                    <span v-if="row.reviewComment" class="resource-sub">审核意见：{{ row.reviewComment }}</span>
                  </template>
                </ElTableColumn>
                <ElTableColumn label="创建时间" width="170">
                  <template #default="{ row }">
                    <span class="member-muted">{{ formatDateTime(row.createdAt) }}</span>
                  </template>
                </ElTableColumn>
              </ElTable>
            </template>
          </ElTabPane>
        </ElTabs>
      </div>

      <ElDialog v-model="versionDialogVisible" title="新建版本" width="520px" append-to-body>
        <ElForm label-position="top">
          <ElFormItem label="分发方式">
            <ElSelect v-model="versionForm.deliveryMode" style="width: 100%">
              <ElOption label="外部链接" value="external" />
              <ElOption label="平台上传（zip / 单文件）" value="hosted" />
            </ElSelect>
          </ElFormItem>
          <ElFormItem v-if="versionForm.deliveryMode === 'external'" label="资源地址">
            <ElInput v-model="versionForm.externalUrl" placeholder="https://… 或内部 Git / npm 地址" />
          </ElFormItem>
          <ElFormItem v-else label="资源文件">
            <div class="upload-block">
              <ElUpload
                drag
                action="/api/app/resource/upload"
                :show-file-list="false"
                :http-request="uploadFile"
                :disabled="versionForm.uploading"
                accept=".zip,.tar,.gz,.tgz,.7z,.rar,.js,.mjs,.cjs,.md,.json,.yml,.yaml,.sql,.txt"
              >
                <div class="upload-area">
                  <KbLucideIcon name="upload" :size="20" />
                  <p class="upload-title">{{ versionForm.uploading ? '正在上传…' : '拖到此处，或点击选择文件' }}</p>
                  <p class="upload-hint">支持 zip、tar.gz 或单个文件，最大 50MB</p>
                </div>
              </ElUpload>
              <div v-if="versionForm.filePath" class="upload-file">
                <KbLucideIcon name="file" :size="16" />
                <span>{{ versionForm.fileName }}</span>
                <span class="member-muted">{{ Math.round(versionForm.fileSize / 1024) }} KB</span>
                <ElButton v-if="versionForm.filePath" link type="primary" @click="downloadUploadCheck">下载校验</ElButton>
              </div>
            </div>
          </ElFormItem>
          <ElFormItem label="变更说明">
            <ElInput v-model="versionForm.changelog" maxlength="500" show-word-limit placeholder="这一版改了什么" />
          </ElFormItem>
        </ElForm>
        <template #footer>
          <ElButton @click="versionDialogVisible = false">取消</ElButton>
          <ElButton type="primary" :loading="versionSaving" @click="createVersion">创建</ElButton>
        </template>
      </ElDialog>
    </section>
  </ElConfigProvider>`
}
