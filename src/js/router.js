/* kooboo-app-base:v2 */
import { createRouter, createWebHashHistory } from 'vue-router'
import DefaultLayout from '/layout.default.js'
import PlannedScreen from '/component.planned-screen.js'
import ForbiddenScreen from '/component.forbidden-screen.js'
import LoginScreen from '/screen.login.js'
import TaxonomyScreen from '/screen.taxonomy.js'
import UsersScreen from '/screen.users.js'
import MyResourcesScreen from '/screen.my-resources.js'
import ResourceEditScreen from '/screen.resource-edit.js'
import ReviewScreen from '/screen.review.js'
import CatalogScreen from '/screen.catalog.js'
import CatalogDetailScreen from '/screen.catalog-detail.js'
import StatsScreen from '/screen.stats.js'
import { hasPermission } from '/service.permission.js' 

// Without planning, create_app_base seeds a neutral landing placeholder. Add business
// routes as persisted Screen modules are implemented. With an App Plan, it seeds one
// route for every planned Screen. Only Screens referenced by
// foundation.navigation appear in the shell; workflow, detail, and action-target Screens
// remain route-only. Implement and persist one Screen module first, then immediately
// replace only that Screen's PlannedScreen component. Never modify the shared managed
// placeholder and never import a Script that does not exist yet. Set meta.public = true
// only for an explicitly public Screen. Access flags do not select a layout.
// Put pages under the parent layout that owns them. Additional layouts are sibling
// routes with their own children; a top-level Screen has no surrounding layout.
// Keep parent layout routes free of public:true; mark anonymous leaf pages explicitly.
export const appRoutes = [
  {
    path: '/',
    name: 'app-layout',
    component: DefaultLayout,
    children: [
      {
        path: '/forbidden',
        name: 'forbidden',
        component: ForbiddenScreen,
        meta: { title: '暂无权限', navigation: false, public: true }
      },
      // Existing absolute page URLs are preserved within this layout.
  { path: '/', name: 'app-home', component: PlannedScreen, meta: { navigation: false, planned: true } },

  { path: '/catalog', name: 'resource-catalog', component: CatalogScreen, meta: { title: '资源目录', navigationLabel: '资源目录', navigationGroup: '资源', navigationIcon: 'library' } },
  { path: '/catalog/:id', name: 'resource-catalog-detail', component: CatalogDetailScreen, meta: { title: '资源详情', navigation: false } },
  { path: '/my-resources', name: 'my-resources', component: MyResourcesScreen, meta: { title: '我的资源', navigationLabel: '我的资源', navigationGroup: '资源', navigationIcon: 'folder-up' } },
  { path: '/my-resources/new', name: 'resource-create', component: ResourceEditScreen, meta: { title: '登记资源', navigation: false } },
  { path: '/my-resources/:id', name: 'resource-edit', component: ResourceEditScreen, meta: { title: '编辑资源', navigation: false } },
  { path: '/review', name: 'review-queue', component: ReviewScreen, meta: { title: '审核台', navigationLabel: '审核台', navigationGroup: '治理', navigationIcon: 'shield-check', permission: 'resource.review' } },
  { path: '/taxonomy', name: 'taxonomy', component: TaxonomyScreen, meta: { title: '分类管理', navigationLabel: '分类管理', navigationGroup: '治理', navigationIcon: 'tags', permission: 'category.manage' } },
  { path: '/users', name: 'users', component: UsersScreen, meta: { title: '用户管理', navigationLabel: '用户管理', navigationGroup: '治理', navigationIcon: 'users', permission: 'member.manage' } },
  { path: '/stats', name: 'usage-stats', component: StatsScreen, meta: { title: '使用统计', navigationLabel: '使用统计', navigationGroup: '治理', navigationIcon: 'chart-column', permission: 'resource.review' } }
    ]
  },
  {
    path: '/login',
    name: 'login',
    component: LoginScreen,
    meta: { title: '登录', navigation: false, public: true }
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
    meta: { navigation: false }
  }
]

export function createAppRouter(bootstrap) {
  const appTitle = document.title
  const router = createRouter({
    history: createWebHashHistory(),
    routes: appRoutes,
    scrollBehavior: () => ({ top: 0 })
  })

  router.beforeEach(to => {
    if (to.meta.public !== true && !bootstrap.authenticated) {
      return { path: '/login', query: { returnUrl: to.fullPath } }
    }

    if (to.path === '/login' && bootstrap.authenticated) {
      return '/'
    }

    if (to.path === '/forbidden') {
      return true
    }

    const userPerms = bootstrap.user?.permissions || []

    // Dynamic landing page resolution for root '/' or empty path
    if (to.path === '/' || to.path === '') {
      const landing = router.getRoutes().find(item =>
        item.path !== '/' && item.path !== '' && item.path !== '/forbidden' &&
        item.meta?.navigation !== false &&
        (item.meta?.navigationLabel || item.meta?.title) &&
        (!item.meta?.permission || hasPermission(item.meta.permission, userPerms))
      )
      if (landing && landing.path !== to.path) {
        return landing.path
      }
      return '/forbidden'
    }

    if (to.meta?.permission) {
      const allowed = hasPermission(to.meta.permission, userPerms)
      if (!allowed) {
        // Forbidden: redirect to the first accessible navigation route instead of blocking
        const fallbackRoute = router.getRoutes().find(item =>
          item.path !== to.path &&
          item.path !== '/' &&
          item.path !== '/forbidden' &&
          item.meta?.navigation !== false &&
          (item.meta?.navigationLabel || item.meta?.title) &&
          (!item.meta?.permission || hasPermission(item.meta.permission, userPerms))
        )
        if (fallbackRoute && fallbackRoute.path !== to.path) {
          return fallbackRoute.path
        }
        return '/forbidden'
      }
    }

    return true
  })

  router.afterEach(to => {
    const title = typeof to.meta.title === 'string' ? to.meta.title : ''
    document.title = title ? `${title} · ${appTitle}` : appTitle
  })

  return router
}
