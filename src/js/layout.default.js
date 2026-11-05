/* kooboo-app-base:v2; shell-template: cpr-workspace; */
/* kooboo-app-base:v2 */
import { appConfig } from '/app-config.js';
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { KbLucideIcon, ElButton, ElDrawer, ElPopover, ElAlert, ElConfigProvider, epZhCn } from '/element-plus.js';
import { useServices } from '/request-context.js';
import { authService } from '/service.auth.js';
import { notificationService } from '/service.notification.js'
import { hasPermission } from '/service.permission.js';
const appName = "Kooboo\u8D44\u6E90\u5171\u4EAB\u5E73\u53F0";

const ResourceNavigation = {
  components: { KbLucideIcon },
  props: { items: { type: Array, default: () => [] }, activePath: { type: String, default: '' } },
  emits: ['navigate'],
  template: `<nav class="cpr-navigation" aria-label="主导航">
    <RouterLink v-for="item in items" :key="item.path" :to="item.path" class="cpr-nav-link" @click="$emit('navigate')"
      :class="{ 'is-active': activePath === item.path || activePath.startsWith(item.path + '/') }"
      :aria-current="activePath === item.path || activePath.startsWith(item.path + '/') ? 'page' : undefined">
      <KbLucideIcon :name="item.icon" :size="21" /><span>{{ item.label }}</span>
    </RouterLink>
  </nav>`
};

export default {
  name: 'DefaultLayout',
  koobooSource: { moduleUrl: import.meta.url },
  components: { ResourceNavigation, KbLucideIcon, ElButton, ElDrawer, ElPopover, ElAlert, ElConfigProvider },
  setup() {
    const bootstrap = inject('app.bootstrap');
    const route = useRoute();
    const router = useRouter();
    const { auth, notification } = useServices(import.meta.url, {
      auth: authService, notification: notificationService
    }, { currentRoute: true });
    const accountOpen = ref(false), notificationsOpen = ref(false), loading = ref(false), loggingOut = ref(false);
    const navigationOpen = ref(false), mainRegion = ref(null);
    const notifications = ref([]), error = ref(''), logoutError = ref('');
    let requestId = 0;
    const userName = computed(() => bootstrap.user?.fullName || bootstrap.user?.displayName || bootstrap.user?.userName || '账户');
    const navigation = computed(() => router.getRoutes().filter(item => item.meta?.navigation !== false && (item.meta?.navigationLabel || item.meta?.title) &&
      (!route.matched[0] || router.resolve(item.path).matched.includes(route.matched[0])) &&
      (!item.meta?.permission || hasPermission(item.meta.permission, bootstrap.user?.permissions))).map(item => ({ path: item.path, label: item.meta?.navigationLabel || item.meta?.title, group: item.meta.navigationGroup || '', icon: item.meta.navigationIcon || 'layout-grid' })));
    async function loadNotifications() {
      const request = ++requestId;
      loading.value = true; error.value = '';
      try { const result = await notification.listNotifications(); if (request === requestId) notifications.value = result.items || []; }
      catch (failure) { if (request === requestId) error.value = failure.message || '通知加载失败'; }
      finally { if (request === requestId) loading.value = false; }
    }
    // Let Popover handle click, keyboard and outside-click events. Toggling in
    // the reference button as well would handle the same interaction twice.
    function setNotificationsOpen(visible) {
      if (notificationsOpen.value === visible) return;
      notificationsOpen.value = visible;
      if (visible) {
        accountOpen.value = false;
        loadNotifications();
      } else {
        requestId++;
        loading.value = false;
      }
    }
    function setAccountOpen(visible) {
      accountOpen.value = visible;
      if (visible) setNotificationsOpen(false);
    }
    async function signOut() {
      if (loggingOut.value) return;
      loggingOut.value = true; logoutError.value = '';
      try { await auth.logout(); } catch (failure) { logoutError.value = failure.message || '退出失败，请重试'; }
      finally { loggingOut.value = false; }
    }
    function openNotification(item) {
      if (!item) return;
      const actionUrl = item.actionUrl || '';
      if (item.id && !item.readAt) { notification.markNotificationRead(item.id).catch(() => {}); }
      if (!actionUrl) return;
      setNotificationsOpen(false);
      router.push(actionUrl);
    }
    watch(() => route.fullPath, () => {
      accountOpen.value = false; setNotificationsOpen(false); navigationOpen.value = false;
      mainRegion.value?.scrollTo({ top: 0 });
    });
    onBeforeUnmount(() => { requestId++; });
    return { notificationsEnabled: appConfig.notificationsEnabled, appName, epZhCn, route, router, userName, navigation, navigationOpen, mainRegion, accountOpen, notificationsOpen, loading, notifications, error, loggingOut, logoutError, loadNotifications, openNotification, setNotificationsOpen, setAccountOpen, signOut };
  },
  template: `<ElConfigProvider :locale="epZhCn">
    <div class="app-root cpr-workspace">
      <a class="cpr-skip-link" href="#main-content" @click.prevent="mainRegion?.focus()">跳至内容</a>
      <aside class="cpr-sidebar">
        <RouterLink to="/" class="cpr-brand" :aria-label="appName">
          <span class="cpr-brand-mark"><KbLucideIcon name="boxes" :size="26" /></span>
          <span class="cpr-brand-name">Kooboo<span>资源共享平台</span></span>
        </RouterLink>
        <ResourceNavigation :items="navigation" :active-path="route.path" />
        <div class="kb-ep-shell-actions cpr-sidebar-actions">
        <ElButton text class="cpr-mobile-toggle" aria-label="打开导航" :aria-expanded="navigationOpen" aria-controls="cpr-mobile-navigation" @click="navigationOpen = true"><KbLucideIcon name="menu" :size="21" /></ElButton>
        <ElPopover v-if="notificationsEnabled" :visible="notificationsOpen" @update:visible="setNotificationsOpen" :width="360" trigger="click" placement="bottom-end" :show-arrow="false" :offset="10" popper-class="kb-ep-header-popover">
          <template #reference>
            <ElButton text class="kb-ep-header-action cpr-notification-trigger" :class="{ 'is-active': notificationsOpen }" aria-label="通知" :aria-expanded="notificationsOpen">
              <KbLucideIcon name="bell" :size="20" />
            </ElButton>
          </template>
          <div class="kb-ep-popover-heading"><strong>通知</strong><span v-if="!loading && !error && notifications.length" class="kb-ep-notification-count">{{ notifications.length }}</span></div>
          <div v-if="loading" class="kb-ep-popover-state" role="status" aria-live="polite">正在加载通知…</div>
          <div v-else-if="error" class="kb-ep-popover-state" role="alert"><p>{{ error }}</p><ElButton plain size="small" @click="loadNotifications">重新加载</ElButton></div>
          <ul v-else-if="notifications.length" class="kb-ep-notification-list"><li v-for="item in notifications" :key="item.id" :class="{ 'kb-ep-notification-link': item.actionUrl }" @click="openNotification(item)"><strong>{{ item.title }}</strong><p>{{ item.message }}</p></li></ul>
          <div v-else class="kb-ep-popover-state" role="status"><KbLucideIcon name="bell" :size="28" /><strong>暂无通知</strong><p>新的通知会显示在这里</p></div>
        </ElPopover>
        <span v-if="notificationsEnabled" class="kb-ep-actions-divider" aria-hidden="true"></span>
        <ElPopover :visible="accountOpen" @update:visible="setAccountOpen" :width="260" trigger="click" placement="bottom-end" :show-arrow="false" :offset="10" popper-class="kb-ep-header-popover">
          <template #reference>
            <ElButton text class="kb-ep-header-action kb-ep-account-trigger" :class="{ 'is-active': accountOpen }" :aria-label="'账户：' + userName" :aria-expanded="accountOpen">
              <span class="kb-ep-account-avatar"><KbLucideIcon name="user-round" :size="18" /></span>
              <span class="kb-ep-account-name">{{ userName }}</span><KbLucideIcon name="chevron-down" :size="14" />
            </ElButton>
          </template>
          <div class="kb-ep-account-summary"><span class="kb-ep-account-avatar"><KbLucideIcon name="user-round" :size="20" /></span><div><span>当前账户</span><strong>{{ userName }}</strong></div></div>
          <ElButton text class="kb-ep-sign-out" :loading="loggingOut" @click="signOut"><KbLucideIcon v-if="!loggingOut" name="log-out" :size="16" /><span>退出登录</span></ElButton>
        </ElPopover>
        </div>
      </aside>
      <main id="main-content" ref="mainRegion" class="cpr-main" data-app-region="content" tabindex="-1">
      <ElAlert v-if="logoutError" :title="logoutError" type="error" show-icon @close="logoutError = ''" />
      <RouterView :key="route.fullPath" />
      </main>
      <ElDrawer v-model="navigationOpen" title="资源共享平台" direction="ltr" size="min(280px, 88vw)" append-to-body class="cpr-mobile-drawer">
        <div id="cpr-mobile-navigation"><ResourceNavigation :items="navigation" :active-path="route.path" @navigate="navigationOpen = false" /></div>
      </ElDrawer>
    </div>
  </ElConfigProvider>`
};
