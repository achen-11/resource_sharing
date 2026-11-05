// Clipboard helper with a legacy fallback.
// navigator.clipboard requires a secure context (https or localhost); internal
// deployments on plain http silently fail there, so fall back to execCommand.

function legacyCopy(text) {
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', 'readonly')
    area.style.position = 'fixed'
    area.style.top = '-1000px'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    area.setSelectionRange(0, area.value.length)
    const copied = document.execCommand('copy')
    document.body.removeChild(area)
    return copied
  } catch {
    return false
  }
}

export async function copyText(text) {
  const value = String(text == null ? '' : text)
  if (!value) {
    return false
  }

  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(value)
      return true
    } catch {
      // fall through to the legacy path
    }
  }

  return legacyCopy(value)
}

export default { copyText }
