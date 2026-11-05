// Authenticated artifact download. API calls carry the JWT in an Authorization header, so a
// plain <a href> cannot reach a protected file. Fetch the bytes, then save them as a blob.
function readToken() {
  try {
    return (sessionStorage.getItem('TOKEN') || '').trim()
  } catch {
    return ''
  }
}

export async function downloadArtifact(url, fileName) {
  const headers = new Headers()
  const token = readToken()
  if (token) {
    headers.set('Authorization', /^Bearer\s+/i.test(token) ? token : `Bearer ${token}`)
  }

  const response = await fetch(url, { credentials: 'same-origin', headers })
  if (!response.ok) {
    let message = `下载失败（${response.status}）`
    try {
      const payload = await response.json()
      if (payload && typeof payload.message === 'string' && payload.message.trim()) {
        message = payload.message.trim()
      }
    } catch {
      // Error body was not JSON.
    }
    throw new Error(message)
  }

  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = fileName || 'download'
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(objectUrl), 4000)
  return blob.size
}

export function versionDownloadUrl(versionId) {
  return `/api/app/download?versionId=${encodeURIComponent(versionId)}`
}

export function uploadCheckUrl(path, resourceId) {
  return `/api/app/download?path=${encodeURIComponent(path)}&resourceId=${encodeURIComponent(resourceId)}`
}
