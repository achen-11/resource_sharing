/* kooboo-app-base:v2 */
import { createApp, nextTick } from 'vue'
import App from '/app.js'
import { createAppRouter } from '/router.js'
import { observeLucideIcons } from '/lucide.js'
import { loadAppBootstrap } from '/service.bootstrap.js'
import { installPreviewSource } from '/preview-source.js'
import { createPermissionContext, installPermissionDirective } from '/service.permission.js' 

const mountElement = document.querySelector('#app')

try {
  const bootstrap = await loadAppBootstrap()
  const app = createApp(App, { bootstrap })
  const router = createAppRouter(bootstrap)
  const permissionCtx = createPermissionContext(bootstrap)
  installPermissionDirective(app, permissionCtx)
  app.provide('app.permission', permissionCtx)
  app.config.globalProperties.$can = permissionCtx.can
  app.config.globalProperties.$canAll = permissionCtx.canAll
  app.config.globalProperties.$isRole = permissionCtx.isRole
  installPreviewSource(app, router)

  app.config.errorHandler = (error, instance, info) => {
    console.error('Vue runtime error', {
      error,
      componentName: instance?.$options?.name || 'UnknownComponent',
      info
    })
  }

  app.use(router)
  try {
    await router.isReady()
  } catch (routerError) {
    console.warn('Initial router navigation failed or aborted', routerError)
  }
  app.mount(mountElement)
  // Expose the router only inside the editor's preview iframe. The authenticated
  // preview bridge owns cross-window messages; the App adds no message listener.
  if (window.parent !== window && new URLSearchParams(window.location.search).get('kooboobridge') === 'true') {
    window.__koobooPreviewRouter = router
    window.dispatchEvent(new Event('kooboo:preview-router-ready'))
  }
  await nextTick()
  try {
    await observeLucideIcons(mountElement)
  } catch (iconError) {
    console.warn('Lucide icon library could not be initialized', iconError)
  }
} catch (error) {
  console.error('Application bootstrap failed', error)
  // Vue never mounted, so [v-cloak] would keep hiding this fallback.
  mountElement.removeAttribute('v-cloak')
  mountElement.innerHTML = '<main class="app-error"><p>Application could not be loaded.</p></main>'
}
