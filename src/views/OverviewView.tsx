import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/schema'
import { formatCents } from '../lib/money'
import { YearChart } from '../components/YearChart'
import { Icon } from '../components/Icon'
import { formatMonth, formatMonthShort, monthKey, refundsByOrder, yearSummary, yearsWithData } from '../stats/spending'

const REMIND_AFTER_DAYS = 30

export function OverviewView() {
  const data = useLiveQuery(async () => ({
    orders: await db.orders.toArray(),
    refunds: refundsByOrder(await db.transactions.where('linkedOrderId').above('').toArray()),
    lastImport: (await db.meta.get('lastImportAt'))?.value,
    now: Date.now(),
  }))
  const [chosenYear, setChosenYear] = useState<number | null>(null)

  if (!data) return null
  const { orders, refunds, lastImport, now } = data

  if (orders.length === 0) {
    return (
      <section className="card empty">
        <div className="empty-icon"><Icon name="package" size={28} /></div>
        <h2>Noch keine Amazon-Daten</h2>
        <p className="muted">Importiere deine erste Amazon-Datei. Zum Ausprobieren kannst du unter „Daten“ Beispieldaten laden.</p>
        <div className="button-row center">
          <Link className="button" to="/import"><Icon name="download" size={18} />Zum Import</Link>
          <Link className="button secondary" to="/einstellungen">Beispieldaten</Link>
        </div>
      </section>
    )
  }

  const years = yearsWithData(orders)
  const year = chosenYear ?? years[0]
  const months = yearSummary(orders, year, refunds)
  const yearTotal = months.reduce((s, m) => s + m.totalCents, 0)
  const yearOrders = months.reduce((s, m) => s + m.orderCount, 0)
  const activeMonths = months.filter((m) => m.orderCount > 0).length
  const currentMonth = monthKey(new Date(now).toISOString())
  const importAgeDays = lastImport ? (now - Date.parse(lastImport)) / 86_400_000 : Infinity

  return (
    <>
      <section className="hero">
        <div className="hero-head">
          <p className="hero-label">Ausgaben {year}</p>
          {years.length > 1 && (
            <select aria-label="Jahr wählen" value={year} onChange={(e) => setChosenYear(Number(e.target.value))}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          )}
        </div>
        <p className="hero-number">{formatCents(yearTotal)}</p>
        <p className="hero-sub">
          <span className="pill">{yearOrders} Bestellungen</span>
          {activeMonths > 0 && <span className="pill">Ø {formatCents(Math.round(yearTotal / activeMonths))} / Monat</span>}
        </p>
        <YearChart months={months} highlight={currentMonth} />
        <div className="hero-actions">
          <Link className="button on-hero ghost" to="/import"><Icon name="download" size={18} />Amazon-Datei importieren</Link>
        </div>
      </section>

      {importAgeDays > REMIND_AFTER_DAYS && (
        <Link to="/import" className="card reminder">
          <span className="reminder-icon"><Icon name="bell" /></span>
          <span className="reminder-text">
            <strong>Zeit für den Monatsimport</strong>
            <span className="muted small">
              {lastImport ? `Letzter Import vor ${Math.floor(importAgeDays)} Tagen.` : 'Noch kein Import.'}
            </span>
          </span>
          <Icon name="right" className="chevron" />
        </Link>
      )}

      <section className="card">
        <h2>Monate</h2>
        <ul className="rows">
          {[...months].reverse().filter((m) => m.orderCount > 0 || m.key === currentMonth).map((m) => (
            <li key={m.key}>
              <Link to={`/monat/${m.key}`} className="row-link">
                <span className="avatar">{formatMonthShort(m.key).slice(0, 3)}</span>
                <div className="row-main">
                  <span className="row-title">{formatMonth(m.key)}</span>
                  <span className="row-sub muted">{m.orderCount} Bestellungen</span>
                </div>
                <span className="row-amount">{formatCents(m.totalCents)}</span>
                <Icon name="right" size={18} className="chevron" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
