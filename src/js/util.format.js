export function formatDateTime(value) {
  if (!value) return ''
  const time = new Date(value)
  if (Number.isNaN(time.getTime())) return ''
  const pad = part => String(part).padStart(2, '0')
  return `${time.getFullYear()}-${pad(time.getMonth() + 1)}-${pad(time.getDate())} ${pad(time.getHours())}:${pad(time.getMinutes())}`
}

export function formatDate(value) {
  const text = formatDateTime(value)
  return text ? text.slice(0, 10) : ''
}
