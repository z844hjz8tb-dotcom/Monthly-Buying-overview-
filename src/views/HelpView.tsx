import { useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { HELP_TOPICS } from '../help/topics'

/** Hilfe & Anleitung: ausklappbare Themen; /hilfe/:thema öffnet und zeigt ein Thema direkt. */
export function HelpView() {
  const { topic } = useParams()
  const openRef = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    if (topic) openRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [topic])

  return (
    <>
      <section className="card">
        <p className="muted">Kurze Anleitungen für alles, was du mit der App machst. Tippe auf ein Thema, um es aufzuklappen.</p>
      </section>
      {HELP_TOPICS.map((t) => (
        <details key={t.id} id={`hilfe-${t.id}`} className="card help-topic" open={t.id === topic} ref={t.id === topic ? openRef : undefined}>
          <summary>
            <span className="avatar" aria-hidden="true"><Icon name={t.icon} size={20} /></span>
            <span className="help-title">{t.title}</span>
            <Icon name="right" size={18} className="chevron help-chevron" />
          </summary>
          <div className="help-body">{t.body}</div>
        </details>
      ))}
    </>
  )
}
