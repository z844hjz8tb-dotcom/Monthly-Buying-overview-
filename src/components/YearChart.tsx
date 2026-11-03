import { useNavigate } from 'react-router-dom'
import { formatCents } from '../lib/money'
import { formatMonth, formatMonthShort, type MonthSummary } from '../stats/spending'

/** Einfaches Balkendiagramm: ein Balken pro Monat, antippen öffnet den Monat. */
export function YearChart({ months, highlight }: { months: MonthSummary[]; highlight?: string }) {
  const navigate = useNavigate()
  const max = Math.max(...months.map((m) => m.totalCents), 1)
  const peak = months.reduce((a, b) => (b.totalCents > a.totalCents ? b : a))

  return (
    <div className="year-chart" aria-label="Ausgaben pro Monat">
      {months.map((m) => {
        const pct = (m.totalCents / max) * 100
        const label = `${formatMonth(m.key)}: ${formatCents(m.totalCents)}`
        return (
          <button
            key={m.key}
            className={`bar-slot${m.key === highlight ? ' current' : ''}`}
            aria-label={label}
            disabled={m.totalCents === 0}
            onClick={() => navigate(`/monat/${m.key}`)}
          >
            <span className="bar-tip" aria-hidden="true">{formatCents(m.totalCents)}</span>
            <span className="bar-track">
              {m === peak && m.totalCents > 0 && (
                <span className="bar-label" style={{ bottom: `${pct}%` }}>
                  {formatCents(m.totalCents).replace(/,\d\d/, '')}
                </span>
              )}
              <span className="bar" style={{ height: m.totalCents ? `max(${pct}%, 3px)` : 0 }} />
            </span>
            <span className="bar-month">{formatMonthShort(m.key).slice(0, 3)}</span>
          </button>
        )
      })}
    </div>
  )
}
