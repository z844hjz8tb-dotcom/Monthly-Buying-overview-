import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { IconName } from '../components/Icon'

/**
 * Anleitung in der App. Jedes Thema hat eine feste id (für Links wie /hilfe/ing).
 * Beim Ändern von Abläufen in der App bitte hier mitpflegen.
 */
export interface HelpTopic {
  id: string
  title: string
  icon: IconName
  body: ReactNode
}

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: 'ueberblick',
    title: 'So funktioniert die App',
    icon: 'home',
    body: (
      <>
        <p>Die App sammelt deine Ausgaben aus mehreren Quellen und zeigt sie pro Monat nach Kategorie:</p>
        <ul>
          <li><strong>Konten:</strong> ING-Girokonto, American Express, PayPal, Bargeld – per Datei-Import oder von Hand.</li>
          <li><strong>Amazon:</strong> deine Bestellungen mit allen Artikeln.</li>
          <li><strong>Bons:</strong> Kassenbons aus Supermarkt und Drogerie, mit den einzelnen Artikeln.</li>
        </ul>
        <p>
          <strong>Alle Daten bleiben auf diesem Gerät.</strong> Es gibt keinen Server und kein Konto. Deshalb ist ein regelmäßiges{' '}
          <Link to="/hilfe/daten">Backup</Link> wichtig.
        </p>
        <p>Die Tabs unten: <strong>Übersicht</strong> (alles zusammen), <strong>Konten</strong>, <strong>Amazon</strong>, <strong>Bons</strong>, <strong>Daten</strong> (Importe, Backup, Design).</p>
      </>
    ),
  },
  {
    id: 'monat',
    title: 'Monatsroutine (am Monatsersten)',
    icon: 'bell',
    body: (
      <>
        <p>Einmal im Monat, am besten am 1., holst du die Daten des Vormonats. Die Exporte gehen nur <strong>am PC</strong> auf den Webseiten von Bank und Amazon.</p>
        <ol>
          <li><Link to="/hilfe/ing">ING-Umsätze</Link> als CSV herunterladen.</li>
          <li><Link to="/hilfe/amex">Amex-Umsätze</Link> als CSV herunterladen.</li>
          <li><Link to="/hilfe/amazon">Amazon-Bestellungen</Link> mit dem Skript exportieren.</li>
          <li>Die Dateien aufs iPhone bringen (iCloud Drive, AirDrop oder Mail an dich selbst) und in der App importieren: Konten → „Umsätze importieren“ bzw. Amazon → „Amazon-Datei importieren“.</li>
          <li>In den Konten nach Buchungen <strong>„ohne Kategorie“</strong> und Umbuchungen <strong>„Konto offen“</strong> schauen und sie einmal zuordnen – mit „merken“ lernt die App das für die Zukunft.</li>
          <li>Unter Daten ein <Link to="/hilfe/daten">Backup</Link> herunterladen.</li>
        </ol>
        <p>Kassenbons erfasst du am besten gleich nach dem Einkauf (siehe <Link to="/hilfe/bons">Kassenbons</Link>).</p>
        <p>Doppelt importieren ist kein Problem: Schon vorhandene Buchungen und Bestellungen werden erkannt und übersprungen.</p>
      </>
    ),
  },
  {
    id: 'ing',
    title: 'ING-Umsätze importieren',
    icon: 'wallet',
    body: (
      <>
        <p><strong>Export (am PC):</strong> ing.de → einloggen → Konto öffnen → <strong>Umsätze</strong> → Zeitraum wählen → <strong>Export → CSV</strong>.</p>
        <p><strong>Import:</strong> Konten → „Umsätze importieren“ → Datei wählen. Die App zeigt eine Vorschau (neu / schon da / ohne Kategorie) – dann „importieren“.</p>
        <p><strong>Vorher einmal einrichten</strong> (Konten → „Konto hinzufügen“), damit Umbuchungen erkannt werden:</p>
        <ul>
          <li>Extra-Konten als „Tagesgeld“ anlegen und bei <strong>„Erkennen an“</strong> den Namen eintragen, unter dem die Überweisung in der ING-Datei steht (z. B. „Notgroschen“, „Kleingeld Plus“).</li>
          <li>Depot als „Depot“ anlegen – der ETF-Sparplan („Wertpapierkauf“) wird automatisch zu „Gespart“.</li>
          <li>Kinderkonten anlegen, „Erkennen an“ = Name des Kindes, Schalter „zählt als Sparen“ nach Wunsch.</li>
        </ul>
        <p><strong>Eigene Namen</strong> (Kontoinhaber) übernimmt die App beim ersten Import aus der Datei. Überweisungen an oder von diesen Namen gelten als Umbuchung zwischen deinen Konten.</p>
        <p>Was automatisch erkannt wird, steht unter <Link to="/hilfe/zaehlen">Was zählt als Ausgabe?</Link></p>
      </>
    ),
  },
  {
    id: 'amex',
    title: 'American-Express-Umsätze importieren',
    icon: 'card',
    body: (
      <>
        <p><strong>Export (am PC):</strong> americanexpress.com/de → einloggen → <strong>Umsätze</strong> bzw. „Kontoaktivität“ → Zeitraum wählen → <strong>Herunterladen → CSV</strong>.</p>
        <p><strong>Import:</strong> genauso wie bei der ING (Konten → „Umsätze importieren“). Die App erkennt die Amex-Datei selbst und wählt das Konto „American Express“.</p>
        <ul>
          <li>„Zahlung/Überweisung erhalten“ ist der Ausgleich vom Girokonto → <strong>Umbuchung</strong>, zählt nicht doppelt.</li>
          <li>Gutschriften auf der Karte sind <strong>Erstattungen</strong> und mindern die Ausgaben.</li>
          <li>„PAYPAL *Händler“ erscheint als „PayPal: Händler“.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'amazon',
    title: 'Amazon-Bestellungen holen',
    icon: 'package',
    body: (
      <>
        <p>Amazon bietet keinen Export an. Deshalb gibt es ein kleines Skript, das du <strong>am PC</strong> in deinem Browser ausführst:</p>
        <ol>
          <li>In der App: Amazon → „Amazon-Datei importieren“ → <strong>Skript kopieren</strong> (oder als Textdatei laden). Optional „Nur Bestellungen ab“ wählen.</li>
          <li>Auf amazon.de <strong>Meine Bestellungen</strong> öffnen und oben den Zeitraum wählen (z. B. „2026“).</li>
          <li><strong>F12</strong> → Reiter <strong>Konsole</strong> → Skript einfügen → <strong>Enter</strong>. Chrome verlangt beim ersten Mal, dass du „Einfügen zulassen“ eintippst.</li>
          <li>Warten bis „Fertig“ (etwa 1 Sekunde pro Bestellung). Die Datei <em>amazon-….json</em> liegt in den Downloads.</li>
          <li>In der App unter „Schritt 2“ die Datei importieren.</li>
        </ol>
        <p>Das Skript läuft nur in deinem Browser und schickt nichts woandershin. Digitale Käufe (Prime Video, Kindle) werden ausgelassen – sie kommen als Abo über das Konto.</p>
        <p><strong>Nichts doppelt:</strong> Amazon-Abbuchungen auf dem Konto enthalten die Bestellnummer. Die App verknüpft beides – gezählt wird die Abbuchung, die Bestellung liefert die Artikel.</p>
        <p>Wenn das Skript etwas meldet, das du nicht verstehst: den Text aus der Konsole aufheben, damit es angepasst werden kann.</p>
      </>
    ),
  },
  {
    id: 'bons',
    title: 'Kassenbons erfassen',
    icon: 'receipt',
    body: (
      <>
        <p>Bons → „Bon erfassen“. Oben unter <strong>„Bon einlesen“</strong> wählst du je nach Laden:</p>
        <table className="help-table">
          <tbody>
            <tr><th>Müller, Lidl</th><td>Bon in der Händler-App als <strong>Bild</strong> sichern → „Bon-Bild“</td></tr>
            <tr><th>Kaufland, Penny</th><td>Bon in der App teilen → „In Dateien sichern“ → „PDF-Bon“</td></tr>
            <tr><th>Papierbon</th><td>Foto machen → „Bon-Bild“ (klappt schlechter als App-Bilder)</td></tr>
          </tbody>
        </table>
        <p>Die Erkennung läuft auf dem iPhone. Beim allerersten Bild werden einmalig ca. 5 MB geladen.</p>
        <p>Danach <strong>prüfen</strong>: Steht „Summe stimmt“, ist alles gelesen. Bei einer Abweichung fehlt ein Artikel oder ein Preis ist falsch – Zeile korrigieren oder ergänzen. Unter „Erkannten Text anzeigen“ siehst du, was gelesen wurde.</p>
        <p><strong>Zuordnen:</strong> Bontexte wie „H-VOLLM. 3,5%“ ordnest du einmal einem Produkt zu („Vollmilch 3,5 %“). Die App merkt sich das für alle Läden – so entstehen die Top-Artikel mit dem günstigsten Laden.</p>
        <p>Pfand, Tüten und Rabattzeilen auf „Ignorieren“ setzen.</p>
      </>
    ),
  },
  {
    id: 'konten',
    title: 'Konten, Umbuchungen und Sparen',
    icon: 'piggy',
    body: (
      <>
        <p><strong>Konto anlegen:</strong> Konten → „Konto hinzufügen“. Arten: Girokonto, Tagesgeld, Depot, Kreditkarte, PayPal, Bargeld.</p>
        <ul>
          <li><strong>„Geld hierhin zählt als Sparen“</strong>: Geld auf dieses Konto erscheint als <em>Gespart</em> (getrennt neben den Ausgaben). Bei Depots voreingestellt.</li>
          <li><strong>„Erkennen an“</strong>: Namen, unter denen Überweisungen auf dieses Konto in der Bank-Datei stehen.</li>
          <li><strong>Stand</strong>: für Konten ohne Buchungen, z. B. ein Aktienkonto – wird unter „Sparen &amp; Anlagen“ zusammengezählt.</li>
          <li><strong>Ausblenden</strong> statt löschen, wenn das Konto Buchungen hat.</li>
        </ul>
        <p><strong>Umbuchung von Hand:</strong> „+ Buchung“ → „Umbuchung“ → Von Konto / Nach Konto. Beide Seiten werden angelegt und hängen zusammen.</p>
        <p><strong>Importierte Umbuchung ohne Zielkonto</strong> („Konto offen“): Buchung öffnen → Zielkonto wählen → „merken“ lassen.</p>
      </>
    ),
  },
  {
    id: 'kategorien',
    title: 'Kategorien und „merken“',
    icon: 'tag',
    body: (
      <>
        <p>Importierte Buchungen bekommen ihre Kategorie automatisch über eingebaute Regeln (z. B. Lidl → Lebensmittel, Tankstelle → Mobilität, Apotheke → Gesundheit).</p>
        <p><strong>Falsch oder fehlend?</strong> Buchung antippen → Kategorie wählen → Schalter <strong>„Für alle Buchungen von … merken“</strong> an lassen → Speichern. Alle gleichen Buchungen werden sofort mit umgestellt, auch künftige.</p>
        <p>Von Hand geänderte Buchungen bleiben so, wie du sie eingestellt hast.</p>
        <p>Gutschriften von Händlern (z. B. Amazon-Rückerstattung) sind <strong>Erstattungen</strong> und mindern die Kategorie, sie sind keine Einnahme.</p>
      </>
    ),
  },
  {
    id: 'zaehlen',
    title: 'Was zählt als Ausgabe?',
    icon: 'chart',
    body: (
      <>
        <p>Grundregel: <strong>Geld zählt einmal</strong> – dort, wo es dein Konto wirklich verlässt.</p>
        <table className="help-table">
          <tbody>
            <tr><th>Ausgabe</th><td>Einkäufe, Abos, Miete, Kreditraten, Zinsen</td></tr>
            <tr><th>Gespart</th><td>ETF-Sparplan, Geld aufs Depot oder Kinderkonto, Ansparung im Bausparvertrag – steht getrennt neben den Ausgaben</td></tr>
            <tr><th>Zählt nicht</th><td>Umbuchungen zwischen deinen Konten, Kreditkarten-Abrechnung vom Girokonto, Bargeld abheben, Darlehensauszahlung</td></tr>
            <tr><th>Einnahme</th><td>Gehalt, Kindergeld, Dividenden, Zinsen</td></tr>
            <tr><th>Erstattung</th><td>Gutschriften von Händlern – mindern die Ausgaben</td></tr>
          </tbody>
        </table>
        <p><strong>Amazon:</strong> Bestellungen werden über die Bestellnummer mit der Kontobuchung verknüpft. Dann zählt die Kontobuchung, die Bestellung liefert die Artikel. Ohne passende Kontobuchung zählt die Bestellung selbst.</p>
        <p><strong>Kassenbons – noch nicht verknüpft:</strong> Die automatische Verknüpfung von Bons mit Kartenzahlungen auf dem Konto kommt noch. Bis dahin zählt ein Einkauf <strong>doppelt</strong>, wenn du den Bon erfasst <em>und</em> die Kartenzahlung importierst. Bar bezahlte Bons sind kein Problem.</p>
      </>
    ),
  },
  {
    id: 'daten',
    title: 'Backup, Speicher und Datenschutz',
    icon: 'save',
    body: (
      <>
        <p><strong>Alle Daten liegen nur auf diesem Gerät</strong> (im Browser-Speicher der App). Nichts wird hochgeladen. Jedes Gerät hat seinen eigenen Speicher – am PC importierte Daten sind nicht auf dem iPhone.</p>
        <ul>
          <li><strong>Backup:</strong> Daten → „Backup herunterladen“ – nach jedem Monatsimport. Mit „Backup einspielen“ stellst du alles wieder her (z. B. auf einem neuen iPhone).</li>
          <li><strong>Dauerhafter Speicher:</strong> App zum Home-Bildschirm hinzufügen und unter Daten „Dauerhaften Speicher anfordern“ – sonst darf iOS die Daten bei Speichermangel löschen.</li>
          <li>Die Backup-Datei enthält alle deine Kontobewegungen – sicher aufbewahren und nicht teilen.</li>
        </ul>
        <p><strong>Design:</strong> Unter Daten → Design wählst du die Farbwelt (Frisch, Sonne, Abend).</p>
      </>
    ),
  },
  {
    id: 'fragen',
    title: 'Häufige Fragen',
    icon: 'alert',
    body: (
      <>
        <p><strong>Die App zeigt noch die alte Version.</strong> App ganz schließen (nach oben wischen) und neu öffnen.</p>
        <p><strong>Eine Datei wird nicht erkannt.</strong> Möglich sind: ING-CSV, Amex-CSV, die Amazon-Datei aus dem Skript, Bon-Bilder und PDF-eBons. Die CSV-Dateien nicht vorher in Excel öffnen und speichern – das verändert das Format.</p>
        <p><strong>Ich habe aus Versehen doppelt importiert.</strong> Kein Problem – schon vorhandene Buchungen werden übersprungen.</p>
        <p><strong>Eine Buchung ist falsch eingeordnet.</strong> Antippen, richtig einordnen, „merken“ an lassen.</p>
        <p><strong>Ausprobieren ohne echte Daten?</strong> Daten → „Beispieldaten laden“; später mit „Beispieldaten entfernen“ wieder weg.</p>
      </>
    ),
  },
]

/** Passendes Hilfe-Thema zur aktuellen Seite (für den ?-Knopf oben) */
export function helpTopicFor(pathname: string): string {
  const map: [string, string][] = [
    ['/import/bank', 'ing'],
    ['/import', 'amazon'],
    ['/uebersicht', 'amazon'],
    ['/monat', 'amazon'],
    ['/bon', 'bons'],
    ['/zuordnen', 'bons'],
    ['/produkte', 'bons'],
    ['/konto', 'konten'],
    ['/buchung', 'kategorien'],
    ['/einstellungen', 'daten'],
    ['/start', 'zaehlen'],
  ]
  return map.find(([p]) => pathname.startsWith(p))?.[1] ?? 'ueberblick'
}
