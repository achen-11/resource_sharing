/* kooboo-app-base:v2 */

function normalizePerm(value) {
  return String(value || "").trim().replace(/^permission\./i, "").toLowerCase()
}

/**
 * Checks whether user has permission.
 * Supports string (e.g. "order.read") or array of strings.
 * Scope resolution:
 *   - "order.read" (all) satisfies required "order.read.self" (self).
 *   - "order.write" (all) satisfies required "order.write.self" (self).
 *   - "order.*" or "order.all" or "*" satisfies all actions and scopes for that module.
 *   - For read access to menus/routes: having "order.read.self" satisfies "order.read" (data is filtered inside the screen).
 */
export function hasPermission(required, permissions = []) {
  if (!required) return true

  const rawPerms = Array.isArray(permissions) ? permissions : []
  const userPerms = rawPerms.map(normalizePerm).filter(Boolean)

  if (userPerms.includes("*") || userPerms.includes("all")) return true

  const checkSingle = perm => {
    const target = normalizePerm(perm)
    if (!target) return true
    if (userPerms.includes(target)) return true

    const dotIndex = target.indexOf(".")
    if (dotIndex > 0) {
      const moduleKey = target.substring(0, dotIndex)
      if (userPerms.includes(`${moduleKey}.*`) || userPerms.includes(`${moduleKey}.all`) || userPerms.includes(moduleKey)) {
        return true
      }
    }

    // Action-level .all scope (e.g. user has "leave-request.read.all" -> satisfies "leave-request.read")
    if (userPerms.includes(`${target}.all`)) return true

    // Full action satisfies .self scope (e.g. user has "order.read" -> satisfies "order.read.self")
    if (target.endsWith(".self")) {
      const basePerm = target.slice(0, -5)
      if (userPerms.includes(basePerm) || userPerms.includes(`${basePerm}.all`)) return true
    }

    // Read navigation entry compatibility: having "order.read.self" satisfies required "order.read" for menu/route
    if (!target.endsWith(".self")) {
      if (userPerms.includes(`${target}.self`) || userPerms.includes(`${target}.team`) || userPerms.includes(`${target}.all`)) {
        return true
      }
    }

    return false
  }

  if (Array.isArray(required)) {
    return required.some(perm => checkSingle(perm))
  }
  return checkSingle(required)
}

/**
 * Creates a permission context helper from bootstrap.
 */
export function createPermissionContext(bootstrap) {
  const user = bootstrap?.user
  const permissions = user?.permissions || []

  return {
    can(permission) {
      return hasPermission(permission, permissions)
    },
    canAll(perms) {
      if (!Array.isArray(perms) || perms.length === 0) return true
      return perms.every(p => hasPermission(p, permissions))
    },
    isRole(roleName) {
      if (!roleName) return true
      return String(user?.role || "").toLowerCase() === String(roleName || "").toLowerCase()
    }
  }
}

function applyPermissionDirective(el, binding, permissionCtx) {
  const required = binding.value
  if (!required) {
    if (binding.modifiers?.disable) {
      el.disabled = false
      el.classList.remove("is-disabled")
    } else if (el._permissionHidden) {
      el.style.display = el._prevDisplay || ""
      el.removeAttribute("aria-hidden")
      el._permissionHidden = false
    }
    return
  }

  const allowed = permissionCtx.can(required)
  if (!allowed) {
    if (binding.modifiers?.disable) {
      el.disabled = true
      el.classList.add("is-disabled")
      el.setAttribute("title", "暂无操作权限")
    } else if (!el._permissionHidden) {
      el._prevDisplay = el.style.display
      el.style.display = "none"
      el.setAttribute("aria-hidden", "true")
      el._permissionHidden = true
    }
  } else {
    if (binding.modifiers?.disable) {
      el.disabled = false
      el.classList.remove("is-disabled")
      if (el.getAttribute("title") === "暂无操作权限") {
        el.removeAttribute("title")
      }
    } else if (el._permissionHidden) {
      el.style.display = el._prevDisplay || ""
      el.removeAttribute("aria-hidden")
      el._permissionHidden = false
    }
  }
}

/**
 * Installs v-permission directive on the Vue application.
 * Usage:
 *   <button v-permission="'order.write'">Edit</button>
 *   <button v-permission="['order.write', 'order.all']">Manage</button>
 *   <button v-permission.disable="'order.delete'">Delete (disabled if no perm)</button>
 */
export function installPermissionDirective(app, permissionCtx) {
  app.directive("permission", {
    mounted(el, binding) {
      applyPermissionDirective(el, binding, permissionCtx)
    },
    updated(el, binding) {
      applyPermissionDirective(el, binding, permissionCtx)
    }
  })
}
