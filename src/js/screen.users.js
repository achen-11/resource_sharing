import { computed, inject, onMounted, ref } from 'vue'
import {
  ElAlert,
  ElConfigProvider,
  ElInput,
  ElMessage,
  ElOption,
  ElSelect,
  ElTable,
  ElTableColumn,
  ElTag,
  KbLucideIcon,
  epZhCn
} from '/element-plus.js'
import { useServices } from '/request-context.js'
import { hasPermission } from '/service.permission.js'
import { memberService } from '/service.member.js'
import { formatDateTime } from '/util.format.js'

export default {
  name: 'UsersScreen',
  koobooSource: { moduleUrl: import.meta.url },
  components: {
    ElAlert,
    ElConfigProvider,
    ElInput,
    ElOption,
    ElSelect,
    ElTable,
    ElTableColumn,
    ElTag,
    KbLucideIcon
  },
  setup() {
    const bootstrap = inject('app.bootstrap', { user: null })
    const { member } = useServices(import.meta.url, { member: memberService })

    const members = ref([])
    const roles = ref([])
    const currentUserId = ref('')
    const loading = ref(false)
    const loadError = ref('')
    const keyword = ref('')

    const canManage = computed(() => hasPermission('member.manage', bootstrap?.user?.permissions || []))

    const filtered = computed(() => {
      const text = keyword.value.trim().toLowerCase()
      if (!text) return members.value
      return members.value.filter(item => {
        const haystack = [item.userName, item.displayName, item.email, ...(item.departments || [])]
          .join(' ')
          .toLowerCase()
        return haystack.indexOf(text) >= 0
      })
    })

    const assignedCount = computed(() => members.value.filter(item => item.roleCode).length)

    function roleNameOf(code) {
      const role = roles.value.find(item => item.code === code)
      return role ? role.name : ''
    }

    async function load() {
      loading.value = true
      loadError.value = ''
      try {
        const data = await member.listMembers()
        members.value = data.items
        roles.value = data.roles
        currentUserId.value = data.currentUserId
      } catch (error) {
        loadError.value = error.message || '加载成员失败'
      } finally {
        loading.value = false
      }
    }

    async function changeRole(row, value) {
      const previous = row.roleCode
      if (previous === value) return

      row.roleCode = value
      row.roleName = roleNameOf(value)

      try {
        await member.assignRole({ koobooUserId: row.koobooUserId, roleCode: value })
        ElMessage.success(value ? `已设为${roleNameOf(value)}` : '已清空角色')
      } catch (error) {
        row.roleCode = previous
        row.roleName = roleNameOf(previous)
        ElMessage.error(error.message || '保存失败')
      }
    }

    onMounted(load)

    return {
      members,
      roles,
      currentUserId,
      loading,
      loadError,
      keyword,
      filtered,
      assignedCount,
      canManage,
      changeRole,
      formatDateTime,
      epZhCn
    }
  },
  template: `<ElConfigProvider :locale="epZhCn">
    <section class="screen users-screen">
      <header class="screen-head">
        <div class="screen-head-text">
          <h1 class="screen-title">用户管理</h1>
          <p class="screen-subtitle">管理成员的平台角色与权限。</p>
        </div>
        <span class="screen-counter">已分配角色 {{ assignedCount }} / {{ members.length }}</span>
      </header>

      <ElAlert v-if="loadError" class="screen-alert" type="error" show-icon :closable="false" :title="loadError" />
      <ElAlert
        v-if="!canManage"
        class="screen-alert"
        type="warning"
        show-icon
        :closable="false"
        title="当前账号没有成员管理权限，只能查看角色分配。"
      />

      <div class="role-legend">
        <article v-for="role in roles" :key="role.code" class="role-card">
          <div class="role-card-head">
            <KbLucideIcon :name="role.code === 'platform-admin' ? 'shield' : (role.code === 'reviewer' ? 'badge-check' : 'user')" :size="16" aria-hidden="true" />
            <span class="role-card-name">{{ role.name }}</span>
          </div>
          <p class="role-card-desc">{{ role.description }}</p>
          <p class="role-card-codes">
            <span v-for="code in role.permissions" :key="code" class="role-code">{{ code }}</span>
          </p>
        </article>
      </div>

      <div class="screen-card">
        <div class="screen-toolbar">
          <ElInput v-model="keyword" class="screen-toolbar-search" clearable placeholder="搜索账号、姓名、邮箱或部门" />
          <p class="screen-note">权限在本平台内生效：分类管理、成员管理、资源审核与登记。</p>
        </div>

        <div v-if="loading" class="screen-loading">正在加载成员…</div>

        <ElTable v-else :data="filtered" stripe style="width: 100%" empty-text="没有匹配的成员">
          <ElTableColumn label="成员" min-width="220">
            <template #default="{ row }">
              <div class="member-name">
                {{ row.displayName }}
                <ElTag v-if="row.koobooUserId === currentUserId" size="small" type="info" effect="plain">我</ElTag>
              </div>
              <div class="member-account">{{ row.userName }}<template v-if="row.email"> · {{ row.email }}</template></div>
            </template>
          </ElTableColumn>
          <ElTableColumn label="部门" min-width="180">
            <template #default="{ row }">
              <div v-if="row.departments && row.departments.length" class="member-depts">
                <ElTag v-for="dept in row.departments" :key="dept" size="small" effect="plain">{{ dept }}</ElTag>
              </div>
              <span v-else class="member-muted">未加入部门</span>
            </template>
          </ElTableColumn>
          <ElTableColumn label="平台管理员" width="120">
            <template #default="{ row }">
              <ElTag v-if="row.isPlatformAdmin" size="small" type="success" effect="plain">是</ElTag>
              <span v-else class="member-muted">否</span>
            </template>
          </ElTableColumn>
          <ElTableColumn label="本平台角色" width="190">
            <template #default="{ row }">
              <ElSelect
                :model-value="row.roleCode"
                :disabled="!canManage || row.koobooUserId === currentUserId"
                size="small"
                style="width: 160px"
                placeholder="未分配"
                @change="value => changeRole(row, value)"
              >
                <ElOption label="未分配" value="" />
                <ElOption v-for="role in roles" :key="role.code" :label="role.name" :value="role.code" />
              </ElSelect>
            </template>
          </ElTableColumn>
          <ElTableColumn label="最近活跃" width="170">
            <template #default="{ row }">
              <span class="member-muted">{{ formatDateTime(row.lastSeenAt) || '尚未登录' }}</span>
            </template>
          </ElTableColumn>
        </ElTable>
      </div>

      <p class="screen-note">管理员不能修改自己的角色，避免把自己锁在门外；需要调整时请让另一位管理员操作。</p>
    </section>
  </ElConfigProvider>`
}
