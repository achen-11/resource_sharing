import { computed, inject, onMounted, ref } from 'vue'
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
import { statsService } from '/service.stats.js'
import { maintenanceService } from '/service.maintenance.js'
import { hasPermission } from '/service.permission.js'
import { formatDateTime } from '/util.format.js'

function shelfTone(state) {
  if (state === '在架') return 'success'
  if (state === '已下架') return 'warning'
  return 'info'
}

export default {
  name: 'UsageStatsScreen',
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
    const bootstrap = inject('app.bootstrap')
    const { stats, maintenance } = useServices(import.meta.url, {
      stats: statsService,
      maintenance: maintenanceService
    })

    const overview = ref(null)
    const loading = ref(false)
    const loadError = ref('')
    const cleanBusy = ref(false)
    const cleanResult = ref('')

    const canClean = computed(() => {
      const user = bootstrap ? bootstrap.user : null
      if (!user) return false
      if (user.isAdmin === true) return true
      return hasPermission('member.manage', user.permissions || [])
    })

    const totals = computed(() => overview.value?.totals || {})

    async function load() {
      loading.value = true
      loadError.value = ''
      try {
        overview.value = await stats.overview()
      } catch (error) {
        overview.value = null
        loadError.value = error.message || '加载统计失败'
      } finally {
        loading.value = false
      }
    }

    async function cleanOrphans() {
      cleanBusy.value = true
      cleanResult.value = ''
      try {
        const result = await maintenance.cleanOrphans({ dryRun: false })
        cleanResult.value = `${result.message}（保留 ${result.kept} 个在用文件${result.missing > 0 ? `，${result.missing} 个在用文件在磁盘上缺失` : ''}）`
        if (result.deleted === 0) {
          ElMessage.info('没有需要清理的孤立文件')
        }
        await load()
      } catch (error) {
        ElMessage.error(error.message || '清理孤立文件失败')
      } finally {
        cleanBusy.value = false
      }
    }

    onMounted(load)

    return {
      overview,
      totals,
      loading,
      loadError,
      cleanBusy,
      cleanResult,
      canClean,
      load,
      cleanOrphans,
      shelfTone,
      formatDateTime,
      epZhCn
    }
  },
  template: `<ElConfigProvider :locale="epZhCn">
    <section class="screen stats-screen">
      <header class="screen-head">
        <div class="screen-head-text">
          <h1 class="screen-title">使用统计</h1>
          <p class="screen-subtitle">查看资源使用情况与下载记录。</p>
        </div>
        <div class="screen-head-actions">
          <ElButton :loading="loading" @click="load"><KbLucideIcon v-if="!loading" name="refresh-cw" :size="16" class="btn-icon" />刷新</ElButton>
          <ElButton v-if="canClean" :loading="cleanBusy" @click="cleanOrphans">清理孤立文件</ElButton>
        </div>
      </header>

      <ElAlert v-if="loadError" class="screen-alert" type="error" show-icon :closable="false" :title="loadError" />

      <ElAlert
        v-if="cleanResult"
        class="screen-alert"
        type="success"
        show-icon
        :closable="true"
        :title="cleanResult"
        @close="cleanResult = ''"
      />

      <div v-if="loading" class="screen-loading">正在汇总数据…</div>

      <template v-else-if="overview">
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-heading"><span class="stat-icon"><KbLucideIcon name="boxes" :size="20" /></span><span class="stat-label">资源总数</span></div>
            <strong class="stat-value">{{ totals.resources || 0 }}</strong>
          </div>
          <div class="stat-card">
            <div class="stat-heading"><span class="stat-icon stat-icon--green"><KbLucideIcon name="package-check" :size="20" /></span><span class="stat-label">在架资源</span></div>
            <strong class="stat-value">{{ totals.listed || 0 }}</strong>
          </div>
          <div class="stat-card">
            <div class="stat-heading"><span class="stat-icon stat-icon--amber"><KbLucideIcon name="archive" :size="20" /></span><span class="stat-label">已下架</span></div>
            <strong class="stat-value">{{ totals.unlisted || 0 }}</strong>
          </div>
          <div class="stat-card">
            <div class="stat-heading"><span class="stat-icon stat-icon--blue"><KbLucideIcon name="clipboard-check" :size="20" /></span><span class="stat-label">待审核</span></div>
            <strong class="stat-value">{{ totals.pending || 0 }}</strong>
          </div>
          <div class="stat-card">
            <div class="stat-heading"><span class="stat-icon stat-icon--green"><KbLucideIcon name="files" :size="20" /></span><span class="stat-label">版本总数</span></div>
            <strong class="stat-value">{{ totals.versions || 0 }}</strong>
          </div>
          <div class="stat-card">
            <div class="stat-heading"><span class="stat-icon stat-icon--blue"><KbLucideIcon name="download" :size="20" /></span><span class="stat-label">累计下载</span></div>
            <strong class="stat-value">{{ totals.downloads || 0 }}</strong>
          </div>
        </div>

        <div class="screen-card" style="margin-top: 16px">
          <div class="doc-toolbar">
            <span class="resource-name">下载最多的资源</span>
          </div>
          <ElTable :data="overview.topResources" row-key="resourceId" style="width: 100%" empty-text="还没有下载记录">
            <ElTableColumn label="资源" min-width="200">
              <template #default="{ row }">{{ row.name }}</template>
            </ElTableColumn>
            <ElTableColumn label="维护人" width="140">
              <template #default="{ row }">{{ row.ownerUserName || '—' }}</template>
            </ElTableColumn>
            <ElTableColumn label="分类" width="140">
              <template #default="{ row }">{{ row.categoryName || '未分类' }}</template>
            </ElTableColumn>
            <ElTableColumn label="状态" width="110">
              <template #default="{ row }">
                <ElTag size="small" :type="shelfTone(row.shelfState)">{{ row.shelfState }}</ElTag>
              </template>
            </ElTableColumn>
            <ElTableColumn label="下载" width="90" align="right">
              <template #default="{ row }">{{ row.downloadCount }}</template>
            </ElTableColumn>
          </ElTable>

          <div v-if="overview.byDepartment.length" style="margin-top: 14px">
            <div class="doc-toolbar">
              <span class="resource-name">部门资源</span>
            </div>
            <ElTable :data="overview.byDepartment" row-key="departmentName" style="width: 100%" empty-text="还没有部门资源">
              <ElTableColumn label="部门" min-width="200">
                <template #default="{ row }">{{ row.departmentName }}</template>
              </ElTableColumn>
              <ElTableColumn label="资源数" width="120" align="right">
                <template #default="{ row }">{{ row.resources }}</template>
              </ElTableColumn>
              <ElTableColumn label="下载" width="110" align="right">
                <template #default="{ row }">{{ row.downloads }}</template>
              </ElTableColumn>
            </ElTable>
          </div>
        </div>

        <div class="screen-card" style="margin-top: 16px">
          <div class="doc-toolbar">
            <span class="resource-name">归属分布</span>
          </div>
          <ElTable :data="overview.byScope" row-key="scope" style="width: 100%" empty-text="还没有资源">
            <ElTableColumn label="归属" min-width="200">
              <template #default="{ row }">{{ row.label }}</template>
            </ElTableColumn>
            <ElTableColumn label="资源数" width="120" align="right">
              <template #default="{ row }">{{ row.resources }}</template>
            </ElTableColumn>
            <ElTableColumn label="下载" width="110" align="right">
              <template #default="{ row }">{{ row.downloads }}</template>
            </ElTableColumn>
          </ElTable>
        </div>

        <div class="screen-card" style="margin-top: 16px">
          <div class="doc-toolbar">
            <span class="resource-name">下载最多的人</span>
          </div>
          <ElTable :data="overview.topUsers" row-key="userName" style="width: 100%" empty-text="还没有下载记录">
            <ElTableColumn label="用户" min-width="200">
              <template #default="{ row }">{{ row.userName }}</template>
            </ElTableColumn>
            <ElTableColumn label="下载次数" width="120" align="right">
              <template #default="{ row }">{{ row.downloads }}</template>
            </ElTableColumn>
          </ElTable>
        </div>

        <div class="screen-card" style="margin-top: 16px">
          <div class="doc-toolbar">
            <span class="resource-name">最近下载</span>
          </div>
          <ElTable :data="overview.recent" style="width: 100%" empty-text="还没有下载记录">
            <ElTableColumn label="资源" min-width="220">
              <template #default="{ row }">{{ row.resourceName || '—' }}</template>
            </ElTableColumn>
            <ElTableColumn label="版本" width="90">
              <template #default="{ row }">v{{ row.versionNo }}</template>
            </ElTableColumn>
            <ElTableColumn label="用户" width="140">
              <template #default="{ row }">{{ row.userName }}</template>
            </ElTableColumn>
            <ElTableColumn label="时间" width="180">
              <template #default="{ row }">
                <span class="member-muted">{{ formatDateTime(row.createdAt) }}</span>
              </template>
            </ElTableColumn>
          </ElTable>
        </div>
      </template>
    </section>
  </ElConfigProvider>`
}
