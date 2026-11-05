import { computed, onMounted, ref } from 'vue'
import {
  ElAlert,
  ElButton,
  ElConfigProvider,
  ElInput,
  ElOption,
  ElSelect,
  ElTag,
  ElTreeSelect,
  KbLucideIcon,
  epZhCn
} from '/element-plus.js'
import { useServices } from '/request-context.js'
import { categoryService } from '/service.category.js'
import { catalogService } from '/service.catalog.js'
import { formatDate } from '/util.format.js'

const SELECT_PROPS = { label: 'name', children: 'children' }
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

function splitTags(value) {
  return String(value || '')
    .split(/[,，]/)
    .map(item => item.trim())
    .filter(Boolean)
}

export default {
  name: 'ResourceCatalogScreen',
  koobooSource: { moduleUrl: import.meta.url },
  components: {
    ElAlert,
    ElButton,
    ElConfigProvider,
    ElInput,
    ElOption,
    ElSelect,
    ElTag,
    ElTreeSelect,
    KbLucideIcon
  },
  setup() {
    const { catalog, category } = useServices(import.meta.url, {
      catalog: catalogService,
      category: categoryService
    })

    const items = ref([])
    const total = ref(0)
    const categories = ref([])
    const loading = ref(false)
    const loadError = ref('')
    const keyword = ref('')
    const scope = ref('')
    const categoryId = ref('')

    const hasFilter = computed(() => Boolean(keyword.value || scope.value || categoryId.value))

    async function load() {
      loading.value = true
      loadError.value = ''
      try {
        const result = await catalog.listCatalog({
          keyword: keyword.value.trim(),
          scope: scope.value,
          categoryId: categoryId.value || ''
        })
        items.value = result.items
        total.value = result.total
      } catch (error) {
        loadError.value = error.message || '加载资源目录失败'
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

    function resetFilters() {
      keyword.value = ''
      scope.value = ''
      categoryId.value = ''
      load()
    }

    onMounted(() => {
      loadCategories()
      load()
    })

    return {
      SELECT_PROPS,
      SCOPE_OPTIONS,
      items,
      total,
      categories,
      loading,
      loadError,
      keyword,
      scope,
      categoryId,
      hasFilter,
      load,
      resetFilters,
      scopeLabel,
      splitTags,
      formatDate,
      epZhCn
    }
  },
  template: `<ElConfigProvider :locale="epZhCn">
    <section class="screen catalog-screen">
      <header class="screen-head">
        <div class="screen-head-text">
          <h1 class="screen-title">资源目录</h1>
          <p class="screen-subtitle">查找和使用团队共享的 Skill、模块包、模板与代码块。</p>
        </div>
        <ElButton :loading="loading" @click="load"><KbLucideIcon v-if="!loading" name="refresh-cw" :size="16" class="btn-icon" />刷新</ElButton>
      </header>

      <ElAlert v-if="loadError" class="screen-alert" type="error" show-icon :closable="false" :title="loadError" />

      <div class="screen-card">
        <div class="screen-toolbar">
          <ElInput
            v-model="keyword"
            class="screen-toolbar-search"
            placeholder="搜索名称、简介、标签或维护人"
            clearable
            @keyup.enter="load"
            @clear="load"
          >
            <template #prefix>
              <KbLucideIcon name="search" :size="16" />
            </template>
          </ElInput>

          <ElSelect v-model="scope" placeholder="归属" style="width: 140px" @change="load">
            <ElOption v-for="item in SCOPE_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
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
            @change="load"
          />

          <ElButton v-if="hasFilter" link type="primary" @click="resetFilters">清除筛选</ElButton>

          <span class="screen-counter">共 {{ total }} 个资源</span>
        </div>
      </div>

      <p v-if="total > items.length" class="form-hint catalog-hint">
        共 {{ total }} 个资源，当前只显示最新的 {{ items.length }} 个，请用关键词或分类缩小范围。
      </p>

      <div v-if="loading" class="screen-loading">正在加载资源目录…</div>

      <div v-else-if="items.length === 0" class="empty-state">
        <KbLucideIcon name="package-open" :size="28" />
        <p>{{ hasFilter ? '没有找到匹配的资源' : '暂无已上架的资源' }}</p>
        <p class="form-hint">{{ hasFilter ? '调整关键词或分类后重试。' : '资源审核通过后会显示在这里。' }}</p>
      </div>

      <div v-else class="catalog-grid">
        <RouterLink v-for="item in items" :key="item.id" class="catalog-card" :to="'/catalog/' + item.id">
          <div class="catalog-card-head">
            <span class="catalog-card-icon"><KbLucideIcon name="package" :size="22" /></span>
            <span class="catalog-card-title">{{ item.name }}</span>
            <ElTag size="small" type="success">v{{ item.versionNo }}</ElTag>
          </div>
          <p class="catalog-card-desc">{{ item.summary || '还没有简介' }}</p>
          <div v-if="splitTags(item.tags).length" class="catalog-tags">
            <span v-for="tag in splitTags(item.tags)" :key="tag" class="catalog-tag">{{ tag }}</span>
          </div>
          <div class="catalog-card-meta">
            <span>{{ item.categoryName || '未分类' }}</span>
            <span>{{ scopeLabel(item) }}</span>
            <span>{{ item.ownerUserName }}</span>
            <span>{{ item.downloadCount }} 次下载</span>
            <span>{{ formatDate(item.updatedAt) }}</span>
          </div>
        </RouterLink>
      </div>
    </section>
  </ElConfigProvider>`
}
