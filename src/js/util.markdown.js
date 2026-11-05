// Minimal, escape-first Markdown renderer for resource guides.
// Everything is HTML-escaped first; only tags produced by these transforms reach the page,
// and link targets are restricted to http(s) and mailto.

const ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}

function escapeHtml(text) {
  return String(text == null ? '' : text).replace(/[&<>"']/g, char => ESCAPE_MAP[char])
}

function safeHref(raw) {
  const value = String(raw || '').trim()
  if (/^https?:\/\//i.test(value) || /^mailto:/i.test(value)) {
    return value
  }
  return ''
}

function renderInline(text) {
  let html = escapeHtml(text)

  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')

  html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label, href) => {
    const target = safeHref(href)
    if (!target) {
      return match
    }
    return `<a href="${escapeHtml(target)}" target="_blank" rel="noopener noreferrer">${label}</a>`
  })

  return html
}

export function renderMarkdown(source) {
  const lines = String(source || '').replace(/\r\n/g, '\n').split('\n')
  const output = []
  let inCode = false
  let codeLines = []
  let listType = ''
  let paragraph = []

  function flushParagraph() {
    if (paragraph.length > 0) {
      output.push(`<p>${renderInline(paragraph.join(' '))}</p>`)
      paragraph = []
    }
  }

  function closeList() {
    if (listType) {
      output.push(`</${listType}>`)
      listType = ''
    }
  }

  function flushCode() {
    output.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`)
    codeLines = []
  }

  for (const line of lines) {
    if (inCode) {
      if (/^```/.test(line)) {
        inCode = false
        flushCode()
      } else {
        codeLines.push(line)
      }
      continue
    }

    if (/^```/.test(line)) {
      flushParagraph()
      closeList()
      inCode = true
      codeLines = []
      continue
    }

    if (!line.trim()) {
      flushParagraph()
      closeList()
      continue
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line)
    if (heading) {
      flushParagraph()
      closeList()
      const level = heading[1].length + 1
      output.push(`<h${level}>${renderInline(heading[2])}</h${level}>`)
      continue
    }

    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      flushParagraph()
      closeList()
      output.push('<hr />')
      continue
    }

    const ordered = /^\d+[.)]\s+(.*)$/.exec(line)
    if (ordered) {
      flushParagraph()
      if (listType !== 'ol') {
        closeList()
        output.push('<ol>')
        listType = 'ol'
      }
      output.push(`<li>${renderInline(ordered[1])}</li>`)
      continue
    }

    const bullet = /^[-*+]\s+(.*)$/.exec(line)
    if (bullet) {
      flushParagraph()
      if (listType !== 'ul') {
        closeList()
        output.push('<ul>')
        listType = 'ul'
      }
      output.push(`<li>${renderInline(bullet[1])}</li>`)
      continue
    }

    if (/^>\s?/.test(line)) {
      flushParagraph()
      closeList()
      output.push(`<blockquote>${renderInline(line.replace(/^>\s?/, ''))}</blockquote>`)
      continue
    }

    paragraph.push(line.trim())
  }

  flushParagraph()
  closeList()

  if (inCode) {
    flushCode()
  }

  return output.join('\n')
}

export default { renderMarkdown }
