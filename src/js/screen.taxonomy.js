import { computed, inject, onMounted, reactive, ref } from 'vue'
import {
  ElAlert,
  ElButton,
  ElConfigProvider,
  ElDialog,
  ElForm,
  ElFormItem,
  ElInput,
  ElInputNumber,
  ElMessage,
  ElMessageBox,
  ElSwitch,
  ElTable,
  ElTableColumn,
  ElTreeSelect,
  KbLucideIcon,
  epZhCn
} from '/element-plus.js'
import { useServices } from '/request-context.js'
import { hasPermission } from '/service.permission.js'
import { categoryService } from '/service.category.js'
import { formatDateTime } from '/util.format.js'

const SELECT_PROPS = { label: 'name', children: 'children' }

export default {
  name: 'TaxonomyScreen',
  koobooSource: { moduleUrl: import.meta.url },
  components: {
    ElAlert,
    ElButton,
    ElConfigProvider,
    ElDialog,
    ElForm,
    ElFormItem,
    ElInput,
    ElInputNumber,
    ElSwitch,
    ElTable,
    ElTableColumn,
    ElTreeSelect,
    KbLucideIcon
  },
  setup() {
    const bootstrap = inject('app.bootstrap', { user: null })
    const { category } = useServices(import.meta.url, { category: categoryService })

    const canManage = computed(() => hasPermission('category.manage', bootstrap?.user?.permissions || []))
    const tree = ref([])
    const loading = ref(false)
    const loadError = ref('')
    const dialogVisible = ref(false)
    const saving = ref(false)
    const editingId = ref('')
    const formRef = ref(null)

    const form = reactive({
      parentId: '',
      name: '',
      description: '',
      sortOrder: null,
      enabled: true
    })

    const rules = {
      name: [
        { required: true, message: '请输入分类名称', trigger: 'blur' },
        { max: 40, message: '分类名称不能超过 40 个字符', trigger: 'blur' }
      ]
    }

    function countNodes(nodes) {
      let total = 0
      for (const node of nodes || []) {
        total += 1 + countNodes(node.children)
      }
      return total
    }

    function buildOptions(nodes, excludeId) {
      const result = []
      for (const node of nodes || []) {
        if (node.id === excludeId) continue
        result.push({
          id: node.id,
          name: node.name,
          children: buildOptions(node.children, excludeId)
        })
      }
      return result
    }

    const totalCount = computed(() => countNodes(tree.value))
    const parentOptions = computed(() => buildOptions(tree.value, editingId.value))

    async function load() {
      loading.value = true
      loadError.value = ''
      try {
        tree.value = await category.listCategories()
      } catch (error) {
        loadError.value = error.message || '加载分类失败'
      } finally {
        loading.value = false
      }
    }

    function openCreate(parentId = '') {
      editingId.value = ''
      Object.assign(form, {
        parentId: parentId || '',
        name: '',
        description: '',
        sortOrder: null,
        enabled: true
      })
      dialogVisible.value = true
    }

    function openEdit(row) {
      editingId.value = row.id
      Object.assign(form, {
        parentId: row.parentId || '',
        name: row.name,
        description: row.description,
        sortOrder: row.sortOrder,
        enabled: row.enabled
      })
      dialogVisible.value = true
    }

    async function submit() {
      if (saving.value) return

      try {
        await formRef.value.validate()
      } catch {
        return
      }

      saving.value = true
      try {
        const payload = {
          name: form.name.trim(),
          description: form.description.trim(),
          parentId: form.parentId || '',
          enabled: form.enabled
        }
        if (form.sortOrder !== null && form.sortOrder !== '' && form.sortOrder !== undefined) {
          payload.sortOrder = Number(form.sortOrder)
        }

        if (editingId.value) {
          await category.updateCategory({ ...payload, id: editingId.value })
        } else {
          await category.createCategory(payload)
        }

        dialogVisible.value = false
        await load()
        ElMessage.success(editingId.value ? '分类已更新' : '分类已创建')
      } catch (error) {
        ElMessage.error(error.message || '保存失败')
      } finally {
        saving.value = false
      }
    }

    async function changeSort(row, value) {
      if (!canManage.value) return
      try {
        await category.updateCategory({
          id: row.id,
          parentId: row.parentId || '',
          name: row.name,
          description: row.description,
          enabled: row.enabled,
          sortOrder: Number(value) || 0
        })
        await load()
      } catch (error) {
        ElMessage.error(error.message || '排序保存失败')
        await load()
      }
    }

    async function toggleEnabled(row, value) {
      if (!canManage.value) return
      try {
        await category.updateCategory({
          id: row.id,
          parentId: row.parentId || '',
          name: row.name,
          description: row.description,
          sortOrder: row.sortOrder,
          enabled: value
        })
        await load()
        ElMessage.success(value ? '分类已启用' : '分类已停用')
      } catch (error) {
        ElMessage.error(error.message || '操作失败')
        await load()
      }
    }

    async function remove(row) {
      const hasChildren = row.children && row.children.length > 0
      try {
        await ElMessageBox.confirm(
          hasChildren
            ? `「${row.name}」下面还有子分类，删除前需要先处理子分类。`
            : `删除分类「${row.name}」后不可恢复，登记资源时也不再可选。`,
          '删除分类',
          { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
        )
      } catch {
        return
      }

      try {
        await category.deleteCategory(row.id)
        await load()
        ElMessage.success('分类已删除')
      } catch (error) {
        ElMessage.error(error.message || '删除失败')
      }
    }

    onMounted(load)

    return {
      SELECT_PROPS,
      canManage,
      tree,
      loading,
      loadError,
      totalCount,
      parentOptions,
      dialogVisible,
      saving,
      editingId,
      form,
      formRef,
      rules,
      openCreate,
      openEdit,
      submit,
      changeSort,
      toggleEnabled,
      remove,
      formatDateTime,
      epZhCn
    }
  },
  template: `<ElConfigProvider :locale="epZhCn">
    <section class="screen taxonomy-screen">
      <header class="screen-head">
        <div class="screen-head-text">
          <h1 class="screen-title">分类管理</h1>
          <p class="screen-subtitle">维护资源分类与层级。</p>
        </div>
        <ElButton v-if="canManage" type="primary" @click="openCreate()">
          <KbLucideIcon name="plus" :size="16" class="btn-icon" />新建根分类
        </ElButton>
      </header>

      <ElAlert
        v-if="!canManage"
        class="screen-alert"
        type="warning"
        show-icon
        :closable="false"
        title="当前账号没有分类管理权限，只能查看分类树。"
      />
      <ElAlert v-if="loadError" class="screen-alert" type="error" show-icon :closable="false" :title="loadError" />

      <div class="screen-card">
        <div class="screen-toolbar">
          <span class="screen-counter">共 {{ totalCount }} 个分类</span>
          <p class="screen-note">顺序直接改「排序」数字，数字小的排前面；留空则由系统排到同级末尾。</p>
        </div>

        <div v-if="loading" class="screen-loading">正在加载分类…</div>

        <ElTable
          v-else
          :data="tree"
          row-key="id"
          default-expand-all
          :indent="18"
          style="width: 100%"
          empty-text="还没有分类，先建一个根分类"
        >
          <ElTableColumn label="分类" min-width="240">
            <template #default="{ row }">
              <span class="tree-name">{{ row.name }}</span>
              <span v-if="row.description" class="tree-desc">{{ row.description }}</span>
            </template>
          </ElTableColumn>
          <ElTableColumn label="排序" width="130">
            <template #default="{ row }">
              <ElInputNumber
                :model-value="row.sortOrder"
                :disabled="!canManage"
                :min="0"
                :max="9999"
                :step="10"
                size="small"
                controls-position="right"
                style="width: 96px"
                @change="value => changeSort(row, value)"
              />
            </template>
          </ElTableColumn>
          <ElTableColumn label="状态" width="90">
            <template #default="{ row }">
              <ElSwitch :model-value="row.enabled" :disabled="!canManage" @change="value => toggleEnabled(row, value)" />
            </template>
          </ElTableColumn>
          <ElTableColumn label="更新时间" width="170">
            <template #default="{ row }">
              <span class="member-muted">{{ formatDateTime(row.updatedAt) }}</span>
            </template>
          </ElTableColumn>
          <ElTableColumn v-if="canManage" label="操作" width="230" align="right">
            <template #default="{ row }">
              <ElButton link type="primary" @click="openCreate(row.id)">加子分类</ElButton>
              <ElButton link type="primary" @click="openEdit(row)">编辑</ElButton>
              <ElButton link type="danger" @click="remove(row)">删除</ElButton>
            </template>
          </ElTableColumn>
        </ElTable>
      </div>

      <ElDialog v-model="dialogVisible" :title="editingId ? '编辑分类' : '新建分类'" width="480px" append-to-body>
        <ElForm ref="formRef" :model="form" :rules="rules" label-position="top">
          <ElFormItem label="上级分类">
            <ElTreeSelect
              v-model="form.parentId"
              :data="parentOptions"
              node-key="id"
              :props="SELECT_PROPS"
              check-strictly
              clearable
              :render-after-expand="false"
              placeholder="不选则作为根分类"
              style="width: 100%"
            />
          </ElFormItem>
          <ElFormItem label="分类名称" prop="name">
            <ElInput v-model="form.name" maxlength="40" show-word-limit placeholder="例如：前端、数据同步、审批流程" />
          </ElFormItem>
          <ElFormItem label="说明" prop="description">
            <ElInput
              v-model="form.description"
              type="textarea"
              :rows="3"
              maxlength="200"
              show-word-limit
              placeholder="一句话说明这里放什么资源"
            />
          </ElFormItem>
          <ElFormItem label="排序">
            <ElInputNumber v-model="form.sortOrder" :min="0" :max="9999" :step="10" controls-position="right" placeholder="留空排末尾" />
            <span class="form-hint">数字越小越靠前</span>
          </ElFormItem>
          <ElFormItem label="启用">
            <ElSwitch v-model="form.enabled" />
            <span class="form-hint">停用后不会出现在登记与检索里</span>
          </ElFormItem>
        </ElForm>
        <template #footer>
          <ElButton @click="dialogVisible = false">取消</ElButton>
          <ElButton type="primary" :loading="saving" @click="submit">保存</ElButton>
        </template>
      </ElDialog>
    </section>
  </ElConfigProvider>`
}
