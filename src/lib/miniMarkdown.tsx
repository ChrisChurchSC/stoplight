import { Fragment, type ReactNode } from 'react'

/**
 * A tiny, dependency-free Markdown renderer for chat answers: headers (#..####),
 * bullet lists (-, *, •), bold (**), and italic (*). Enough to render the grounded
 * answers richly without pulling in a full Markdown library. Plain text passes through
 * unchanged as paragraphs.
 */

function inline(text: string): ReactNode[] {
  // Split on **bold** and *italic* / _italic_, keeping the delimiters.
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_)/g)
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>
    if ((p.startsWith('*') && p.endsWith('*')) || (p.startsWith('_') && p.endsWith('_'))) return <em key={i}>{p.slice(1, -1)}</em>
    return <Fragment key={i}>{p}</Fragment>
  })
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  const lines = text.split('\n')
  const blocks: ReactNode[] = []
  let i = 0
  let key = 0
  const isBullet = (l: string) => /^\s*[-*•]\s+/.test(l)
  const isHeader = (l: string) => /^\s*#{1,4}\s+/.test(l)

  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i++
      continue
    }
    const h = /^\s*(#{1,4})\s+(.*)/.exec(line)
    if (h) {
      const level = h[1].length
      const Tag = level <= 2 ? 'h3' : 'h4'
      blocks.push(
        <Tag key={key++} className="md-h">
          {inline(h[2])}
        </Tag>,
      )
      i++
      continue
    }
    if (isBullet(line)) {
      const items: string[] = []
      while (i < lines.length && isBullet(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*•]\s+/, ''))
        i++
      }
      blocks.push(
        <ul key={key++} className="md-ul">
          {items.map((it, j) => (
            <li key={j}>{inline(it)}</li>
          ))}
        </ul>,
      )
      continue
    }
    const para: string[] = []
    while (i < lines.length && lines[i].trim() && !isHeader(lines[i]) && !isBullet(lines[i])) {
      para.push(lines[i])
      i++
    }
    blocks.push(
      <p key={key++} className="md-p">
        {inline(para.join(' '))}
      </p>,
    )
  }

  return <div className={`md${className ? ` ${className}` : ''}`}>{blocks}</div>
}
