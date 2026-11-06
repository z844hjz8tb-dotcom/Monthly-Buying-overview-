import { HashRouter, Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { OverviewView } from './views/OverviewView'
import { ImportView } from './views/ImportView'
import { SettingsView } from './views/SettingsView'
import { MonthView } from './views/MonthView'
import { ReceiptsView } from './views/ReceiptsView'
import { ReceiptEditor } from './views/ReceiptEditor'
import { AssignView } from './views/AssignView'
import { ProductsView } from './views/ProductsView'
import { Icon, type IconName } from './components/Icon'
import { CategoryView } from './views/CategoryView'
import { SavingsView } from './views/SavingsView'
import { HomeView } from './views/HomeView'
import { AccountEditor, AccountsView, AccountView } from './views/AccountsView'
import { TransactionEditor } from './views/TransactionEditor'
import { BankImportView } from './views/BankImportView'
import { HelpView } from './views/HelpView'
import { helpTopicFor } from './help/topics'

const NAV: { to: string; label: string; icon: IconName; also?: string[] }[] = [
  { to: '/start', label: 'Übersicht', icon: 'home', also: ['/kategorie', '/gespart'] },
  { to: '/konten', label: 'Konten', icon: 'wallet', also: ['/konto', '/buchung', '/import/bank'] },
  { to: '/uebersicht', label: 'Amazon', icon: 'package', also: ['/monat'] },
  { to: '/bons', label: 'Bons', icon: 'receipt', also: ['/bon/', '/zuordnen', '/produkte'] },
  { to: '/einstellungen', label: 'Daten', icon: 'database' },
]

/** Seitentitel in der Kopfzeile, passend zur Route */
const TITLES: [string, string][] = [
  ['/start', 'Übersicht'],
  ['/kategorie/', 'Kategorie'],
  ['/gespart/', 'Gespart'],
  ['/konten', 'Konten'],
  ['/konto-neu', 'Neues Konto'],
  ['/konto/', 'Konto'],
  ['/buchung/neu', 'Neue Buchung'],
  ['/buchung/', 'Buchung'],
  ['/bon/neu', 'Neuer Bon'],
  ['/bon/', 'Bon'],
  ['/bons', 'Kassenbons'],
  ['/zuordnen', 'Zuordnen'],
  ['/produkte', 'Produkte'],
  ['/monat', 'Amazon'],
  ['/uebersicht', 'Amazon'],
  ['/import/bank', 'Umsätze importieren'],
  ['/import', 'Amazon-Import'],
  ['/einstellungen', 'Daten & Design'],
  ['/hilfe', 'Hilfe & Anleitung'],
]

function Header() {
  const { pathname } = useLocation()
  const title = TITLES.find(([p]) => pathname.startsWith(p))?.[1] ?? 'Ausgaben'
  return (
    <header className="app-header">
      <span className="logo-mark" aria-hidden="true"><Icon name="up" size={18} /></span>
      <h1>{title}</h1>
      {!pathname.startsWith('/hilfe') && (
        <Link className="help-btn" to={`/hilfe/${helpTopicFor(pathname)}`} aria-label="Hilfe zu dieser Seite">
          <Icon name="help" size={22} />
        </Link>
      )}
    </header>
  )
}

export default function App() {
  return (
    <HashRouter>
      <div className="app">
        <Header />
        <main className="app-main">
          <Routes>
            <Route path="/start" element={<HomeView />} />
            <Route path="/start/:month" element={<HomeView />} />
            <Route path="/kategorie/:id/:month" element={<CategoryView />} />
            <Route path="/gespart/:month" element={<SavingsView />} />
            <Route path="/konten" element={<AccountsView />} />
            <Route path="/konto-neu" element={<AccountEditor key="new" />} />
            <Route path="/konto/:id/bearbeiten" element={<AccountEditor />} />
            <Route path="/konto/:id" element={<AccountView />} />
            <Route path="/konto/:id/:month" element={<AccountView />} />
            <Route path="/buchung/neu" element={<TransactionEditor key="new" />} />
            <Route path="/buchung/:id" element={<TransactionEditor />} />
            <Route path="/uebersicht" element={<OverviewView />} />
            <Route path="/monat/:key" element={<MonthView />} />
            <Route path="/bons" element={<ReceiptsView />} />
            <Route path="/bons/:month" element={<ReceiptsView />} />
            <Route path="/bon/neu" element={<ReceiptEditor key="new" />} />
            <Route path="/bon/:id" element={<ReceiptEditor />} />
            <Route path="/zuordnen" element={<AssignView />} />
            <Route path="/produkte" element={<ProductsView />} />
            <Route path="/import/bank" element={<BankImportView />} />
            <Route path="/import" element={<ImportView />} />
            <Route path="/einstellungen" element={<SettingsView />} />
            <Route path="/hilfe" element={<HelpView />} />
            <Route path="/hilfe/:topic" element={<HelpView key="topic" />} />
            <Route path="*" element={<Navigate to="/start" replace />} />
          </Routes>
        </main>
        <BottomNav />
      </div>
    </HashRouter>
  )
}

function BottomNav() {
  const { pathname } = useLocation()
  return (
    <nav className="bottom-nav" aria-label="Hauptnavigation">
      {NAV.map((n) => {
        const active = pathname.startsWith(n.to) || (n.also ?? []).some((p) => pathname.startsWith(p))
        return (
          <NavLink key={n.to} to={n.to} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined}>
            <Icon name={n.icon} size={22} />
            <span>{n.label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}
