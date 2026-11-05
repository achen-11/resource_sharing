import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  ElAlert,
  ElButton,
  ElConfigProvider,
  ElInput,
  ElMessage,
  ElMessageBox,
  ElOption,
  ElPagination,
  ElSelect,
  ElTable,
  ElTableColumn,
  ElTag,
  ElTreeSelect,
  KbLucideIcon,
  epZhCn
} from '/element-plus.js'
import { useServices } from '/request-context.js'
import { categoryService } from '/service.category.js'
import { resourceService } from '/service.resource.js'
import { shelfService } from '/service.shelf.js'
import { formatDateTime } from '/util.format.js'

const STATUS_META = {
  none: { label: '未提交', type: 'info' },
  draft: { label: '草稿', type: 'info' },
  pending: { label: '审核中', type: 'warning' },
  published: { label: '已发布', type: 'success' },
  rejected: { label: '已驳回', type: 'danger' }
}

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'none', label: '未提交' },
  { value: 'draft', label: '草稿' },
  { value: 'pending', label: '审核中' },
  { value: 'published', label: '已发布' },
  { value: 'rejected', label: '已驳回' }
]

const SELECT_PROPS = { label: 'name', children: 'children' }

export default {
  name: 'MyResourcesScreen',
  koobooSource: { moduleUrl: import.meta.url },
  components: {
    ElAlert,
    ElButton,
    ElConfigProvider,
    ElInput,
    ElOption,
    ElPagination,
    ElSelect,
    ElTable,
    ElTableColumn,
    ElTag,
    ElTreeSelect,
    KbLucideIcon
  },
  setup() {
    const router = useRouter()
    const { resource, category, shelf } = useServices(import.meta.url, {
      resource: resourceService,
      category: categoryService,
      shelf: shelfService
    })

    const items = ref([])
    const categories = ref([])
    const total = ref(0)
    const page = ref(1)
    const pageSize = ref(20)
    const loading = ref(false)
    const loadError = ref('')
    const keyword = ref('')
    const status = ref('')
    const categoryId = ref('')
    const submittingId = ref('')
    const shelfBusyId = ref('')

    const hasFilter = computed(() => Boolean(keyword.value || status.value || categoryId.value))

    async function load() {
      loading.value = true
      loadError.value = ''
      try {
        const result = await resource.listMyResources({
          keyword: keyword.value.trim(),
          status: status.value,
          categoryId: categoryId.value || '',
          page: page.value,
          pageSize: pageSize.value
        })
        items.value = result.items
        total.value = result.total
      } catch (error) {
        loadError.value = error.message || '加载资源失败'
      } finally {
        loading.value = false
      }
    }

    async function loadCategories() {
      try {
        categories.value = await category.listCategories()
      } catch {
        categories.value = []
      }
    }

    function statusMeta(value) {
      return STATUS_META[value] || STATUS_META.none
    }

    function scopeLabel(row) {
      if (row.scope === 'public') return '公共'
      if (row.scope === 'department') return row.departmentName ? `部门 · ${row.departmentName}` : '部门'
      return '私有'
    }

    function applyFilters() {
      page.value = 1
      load()
    }

    function changePage(next) {
      page.value = next
      load()
    }

    function resetFilters() {
      keyword.value = ''
      status.value = ''
      categoryId.value = ''
      page.value = 1
      load()
    }

    function openCreate() {
      router.push('/my-resources/new')
    }

    function openEdit(row) {
      router.push(`/my-resources/${row.id}`)
    }

    async function submit(row) {
      if (row.latestVersionNo <= 0) {
        return
      }
      try {
        await ElMessageBox.confirm(
          `把「${row.name}」的 v${row.latestVersionNo} 提交审核？提交后需要等审核人处理。`,
          '提交审核',
          { confirmButtonText: '提交', cancelButtonText: '取消', type: 'info' }
        )
      } catch {
        return
      }

      submittingId.value = row.id
      try {
        await resource.submitVersion({ resourceId: row.id })
        await load()
        ElMessage.success('已提交审核')
      } catch (error) {
        ElMessage.error(error.message || '提交失败')
      } finally {
        submittingId.value = ''
      }
    }

    async function remove(row) {
      try {
        await ElMessageBox.confirm(
          `删除「${row.name}」会连同它的全部版本一起移除，且无法恢复。`,
          '删除资源',
          { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
        )
      } catch {
        return
      }

      try {
        await resource.deleteResource(row.id)
        await load()
        ElMessage.success('资源已删除')
      } catch (error) {
        ElMessage.error(error.message || '删除失败')
      }
    }

    function shelfMeta(row) {
      if (!row.publishedVersionNo || row.publishedVersionNo <= 0) {
        return { label: '未上架', type: 'info' }
      }
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
            : `下架后「${row.name}」会从资源目录消失，已经下载过的不受影响。`,
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

    onMounted(() => {
      loadCategories()
      load()
    })

    return {
      STATUS_OPTIONS,
      SELECT_PROPS,
      items,
      categories,
      total,
      page,
      pageSize,
      changePage,
      applyFilters,
      loading,
      loadError,
      keyword,
      status,
      categoryId,
      hasFilter,
      submittingId,
      shelfBusyId,
      shelfMeta,
      setShelfState,
      load,
      statusMeta,
      scopeLabel,
      resetFilters,
      openCreate,
      openEdit,
      submit,
      remove,
      formatDateTime,
      epZhCn
    }
  },
  template: `<ElConfigProvider :locale="epZhCn">
    <section class="screen my-resources-screen">
      <header class="screen-head">
        <div class="screen-head-text">
          <h1 class="screen-title">我的资源</h1>
          <p class="screen-subtitle">管理你维护的资源、版本与发布状态。</p>
        </div>
        <ElButton type="primary" @click="openCreate">
          <KbLucideIcon name="plus" :size="16" class="btn-icon" />登记资源
        </ElButton>
      </header>

      <ElAlert v-if="loadError" class="screen-alert" type="error" show-icon :closable="false" :title="loadError" />

      <div class="screen-card">
        <div class="screen-toolbar">
          <ElInput
            v-model="keyword"
            class="screen-toolbar-search"
            placeholder="搜索名称、简介或标签"
            clearable
            @keyup.enter="applyFilters"
            @clear="applyFilters"
          >
            <template #prefix>
              <KbLucideIcon name="search" :size="16" />
            </template>
          </ElInput>

          <ElSelect v-model="status" placeholder="状态" style="width: 140px" @change="applyFilters">
            <ElOption v-for="item in STATUS_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
          </ElSelect>

          <ElTreeSelect
            v-model="categoryId"
            :data="categories"
            node-key="id"
            :props="SELECT_PROPS"
            check-strictly
            clearable
            placeholder="全部分类"
            style="width: 200px"
            @change="applyFilters"
          />

          <ElButton v-if="hasFilter" link type="primary" @click="resetFilters">清除筛选</ElButton>

          <span class="screen-counter">共 {{ total }} 个资源</span>
        </div>

        <div v-if="loading" class="screen-loading">正在加载资源…</div>

        <ElTable v-else :data="items" row-key="id" style="width: 100%" empty-text="还没有登记资源">
          <ElTableColumn label="资源" min-width="220">
            <template #default="{ row }">
              <span class="resource-name">{{ row.name }}</span>
              <span v-if="row.summary" class="resource-sub">{{ row.summary }}</span>
            </template>
          </ElTableColumn>
          <ElTableColumn label="分类" width="110">
            <template #default="{ row }">
              <span>{{ row.categoryName || '—' }}</span>
            </template>
          </ElTableColumn>
          <ElTableColumn label="归属" width="130">
            <template #default="{ row }">
              <span class="resource-scope">{{ scopeLabel(row) }}</span>
            </template>
          </ElTableColumn>
          <ElTableColumn label="状态" width="180">
            <template #default="{ row }">
              <div v-if="row.latestVersionNo > 0" class="status-cell">
                <span class="resource-scope">v{{ row.latestVersionNo }}</span>
                <ElTag size="small" :type="statusMeta(row.latestVersionStatus).type">
                  {{ statusMeta(row.latestVersionStatus).label }}
                </ElTag>
                <ElTag size="small" :type="shelfMeta(row).type">{{ shelfMeta(row).label }}</ElTag>
              </div>
              <span v-else class="member-muted">还没有版本</span>
            </template>
          </ElTableColumn>
          <ElTableColumn label="更新时间" width="150">
            <template #default="{ row }">
              <span class="member-muted">{{ formatDateTime(row.updatedAt) }}</span>
            </template>
          </ElTableColumn>
          <ElTableColumn label="操作" width="200" fixed="right" align="right">
            <template #default="{ row }">
              <ElButton link type="primary" @click="openEdit(row)">编辑</ElButton>
              <ElButton
                v-if="row.latestVersionNo > 0 && (row.latestVersionStatus === 'draft' || row.latestVersionStatus === 'rejected')"
                link
                type="primary"
                :loading="submittingId === row.id"
                @click="submit(row)"
              >
                送审
              </ElButton>
              <ElButton
                v-if="row.publishedVersionNo > 0 && row.shelfStatus === 'listed'"
                link
                type="warning"
                :loading="shelfBusyId === row.id"
                @click="setShelfState(row, false)"
              >
                下架
              </ElButton>
              <ElButton
                v-if="row.publishedVersionNo > 0 && row.shelfStatus === 'unlisted'"
                link
                type="success"
                :loading="shelfBusyId === row.id"
                @click="setShelfState(row, true)"
              >
                恢复上架
              </ElButton>
              <ElButton
                v-if="row.latestVersionStatus !== 'pending' && !(row.publishedVersionNo > 0 && row.shelfStatus === 'listed')"
                link
                type="danger"
                @click="remove(row)"
              >
                删除
              </ElButton>
            </template>
          </ElTableColumn>
        </ElTable>

        <div v-if="total > pageSize" class="screen-pager">
          <ElPagination
            :current-page="page"
            :page-size="pageSize"
            :total="total"
            layout="prev, pager, next"
            background
            @current-change="changePage"
          />
        </div>
      </div>
    </section>
  </ElConfigProvider>`
}
