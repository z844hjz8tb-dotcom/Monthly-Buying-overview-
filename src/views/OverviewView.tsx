import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/schema'
import { formatCents } from '../lib/money'
import { YearChart } from '../components/YearChart'
import { formatMonth, monthKey, yearSummary, yearsWithData } from '../stats/spending'

const REMIND_AFTER_DAYS = 30

export function OverviewView() {
  const data = useLiveQuery(async () => ({
    orders: await db.orders.toArray(),
    lastImport: (await db.meta.get('lastImportAt'))?.value,
    now: Date.now(),
  }))
  const [chosenYear, setChosenYear] = useState<number | null>(null)

  if (!data) return null
  const { orders, lastImport, now } = data

  if (orders.length === 0) {
    return (
      <section className="card empty">
        <h2>Noch keine Daten</h2>
        <p>Importiere deine erste Amazon-Datei.</p>
        <p className="muted">Zum Ausprobieren kannst du unter „Daten“ Beispieldaten laden.</p>
        <div className="button-row center">
          <Link className="button" to="/import">Zum Import</Link>
          <Link className="button secondary" to="/einstellungen">Beispieldaten</Link>
        </div>
      </section>
    )
  }

  const years = yearsWithData(orders)
  const year = chosenYear ?? years[0]
  const months = yearSummary(orders, year)
  const yearTotal = months.reduce((s, m) => s + m.totalCents, 0)
  const yearOrders = months.reduce((s, m) => s + m.orderCount, 0)
  const currentMonth = monthKey(new Date(now).toISOString())
  const importAgeDays = lastImport ? (now - Date.parse(lastImport)) / 86_400_000 : Infinity

  return (
    <>
      {importAgeDays > REMIND_AFTER_DAYS && (
        <Link to="/import" className="card reminder">
          <strong>Zeit für den Monatsimport</strong>
          <span className="muted">
            {lastImport ? `Letzter Import vor ${Math.floor(importAgeDays)} Tagen.` : 'Noch kein Import.'} Antippen zum Importieren.
          </span>
        </Link>
      )}

      <section className="card">
        <div className="card-head">
          <h2>Jahr {year}</h2>
          {years.length > 1 && (
            <select aria-label="Jahr wählen" value={year} onChange={(e) => setChosenYear(Number(e.target.value))}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          )}
        </div>
        <p className="big-number">{formatCents(yearTotal)}</p>
        <p className="muted">{yearOrders} Bestellungen</p>
        <YearChart months={months} highlight={currentMonth} />
      </section>

      <section className="card">
        <h2>Monate</h2>
        <ul className="rows">
          {[...months].reverse().filter((m) => m.orderCount > 0 || m.key === currentMonth).map((m) => (
            <li key={m.key}>
              <Link to={`/monat/${m.key}`} className="row-link">
                <div className="row-main">
                  <span className="row-title">{formatMonth(m.key)}</span>
                  <span className="row-sub muted">{m.orderCount} Bestellungen</span>
                </div>
                <span className="row-amount">{formatCents(m.totalCents)}</span>
                <span className="chevron" aria-hidden="true">›</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
