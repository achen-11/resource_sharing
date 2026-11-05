/* kooboo-app-base:v2 */
import { createRequestContext } from '/request-context.js'

const sourceHeaders = {
  screen: 'X-UI-Screen',
  route: 'X-UI-Route',
  source: 'X-UI-Source',
  service: 'X-UI-Service'
}

function hasAuthCookie() {
  try {
    return /(?:^|;\s*)jwt_token=[^;]+/.test(document.cookie || '')
  } catch {
    return false
  }
}

function getLocalAuthToken() {
  try {
    // 1. Check URL query token (__token) for immediate preview/iframe injection
    if (typeof window !== 'undefined' && window.location) {
      const url = new URL(window.location.href)
      const urlToken = url.searchParams.get('__token')
      if (urlToken && urlToken.trim()) {
        const clean = urlToken.trim()
        sessionStorage.setItem('TOKEN', clean)
        document.cookie = 'jwt_token=' + encodeURIComponent(clean) + '; path=/; SameSite=Lax'
        url.searchParams.delete('__token')
        const newSearch = url.searchParams.toString()
        const cleanUrl = url.pathname + (newSearch ? '?' + newSearch : '') + url.hash
        window.history.replaceState(null, '', cleanUrl)
        return clean
      }
    }
    const token = sessionStorage.getItem('TOKEN') || ''
    return token.trim()
  } catch {
    return ''
  }
}

// Each method receives its own request closure. Its context survives awaits and
// concurrent calls without relying on a global current caller or stack inspection.
function extractErrorMessage(payload, rawText, status) {
  if (payload) {
    if (typeof payload === 'string' && payload.trim()) {
      return payload.trim()
    }
    if (typeof payload === 'object') {
      const candidate =
        payload.message ||
        payload.error ||
        payload.msg ||
        payload.errorMessage ||
        payload.error_description
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim()
      }
      if (candidate && typeof candidate === 'object') {
        const nested = candidate.message || candidate.error || candidate.msg
        if (typeof nested === 'string' && nested.trim()) {
          return nested.trim()
        }
      }
      if (Array.isArray(payload) && payload.length > 0) {
        const joined = payload
          .map(item => (typeof item === 'string' ? item : item?.message || item?.error || ''))
          .filter(Boolean)
          .join('; ')
        if (joined) return joined
      }
    }
  }

  if (rawText && typeof rawText === 'string') {
    const trimmed = rawText.trim()
    if (trimmed && !/^\s*</i.test(trimmed)) {
      return trimmed
    }
  }

  return `Request failed with status ${status}`
}

export function defineService(moduleUrl, methods) {
  const source = new URL(moduleUrl, window.location.href).pathname
  const unboundMethods = new Set()
  function withContext(context = {}) {
    return Object.freeze(Object.fromEntries(Object.entries(methods).map(([name, handler]) => [
      name,
      (...args) => {
        const snapshot = createRequestContext({
          ...(typeof context === 'function' ? context() : context),
          service: `${source}#${name}`
        })
        if (!snapshot.source && !unboundMethods.has(name)) {
          unboundMethods.add(name)
          console.warn(`[Kooboo request source] ${source}#${name} has no caller. Bind it with useServices in setup, or bindServices outside Vue.`)
        }
        const request = (url, options = {}) => requestJson(url, { ...options, context: snapshot })
        return handler(request, ...args)
      }
    ])))
  }
  return Object.freeze({ ...withContext(), withContext })
}

export async function requestJson(url, options = {}) {
  const { context: sourceContext, ...fetchOptions } = options
  const context = createRequestContext(sourceContext)
  const headers = new Headers(fetchOptions.headers)
  if (!headers.has('Accept')) headers.set('Accept', 'application/json')

  const target = new URL(url, window.location.href)
  // API routes are application-owned and need not use an /api/app/ prefix.
  const isSameOrigin = target.origin === window.location.origin
  for (const [key, name] of Object.entries(sourceHeaders)) {
    // Reserved source headers are managed here, including for external requests.
    headers.delete(name)
    if (isSameOrigin && context[key]) headers.set(name, context[key])
  }

  if (isSameOrigin && !headers.has('Authorization')) {
    const token = getLocalAuthToken()
    if (token) {
      headers.set('Authorization', /^Bearer\s+/i.test(token) ? token : `Bearer ${token}`)
    }
  }

  let body = fetchOptions.body
  if (body !== undefined && body !== null && typeof body !== 'string') {
    if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
    body = JSON.stringify(body)
  }

  const request = Object.freeze({
    method: (fetchOptions.method || 'GET').toUpperCase(),
    path: target.pathname,
    context
  })

  let response
  try {
    response = await fetch(url, {
      credentials: 'same-origin',
      ...fetchOptions,
      headers,
      body
    })
  } catch (error) {
    // Preserve the original error (including AbortError) and add code location hints.
    if (error instanceof Error) error.request = request
    throw error
  }

  let payload = null
  let rawText = ''
  if (response.status !== 204) {
    rawText = await response.text().catch(() => '')
    if (rawText) {
      try {
        payload = JSON.parse(rawText)
      } catch {
        payload = null
      }
    }
  }

  if (!response.ok) {
    const message = extractErrorMessage(payload, rawText, response.status)
    const error = new Error(message)
    error.status = response.status
    error.payload = payload ?? rawText
    error.request = request
    throw error
  }

  return payload !== null ? payload : (rawText || null)
}
