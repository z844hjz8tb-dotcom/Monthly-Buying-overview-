import { TABLES, type TableName, type TrackerDB } from './schema'

export const BACKUP_FORMAT = 'ausgaben-tracker-backup'
export const BACKUP_VERSION = 1

export interface Backup {
  format: typeof BACKUP_FORMAT
  version: number
  exportedAt: string
  tables: Record<TableName, unknown[]>
}

export async function createBackup(db: TrackerDB): Promise<Backup> {
  const tables = {} as Record<TableName, unknown[]>
  await db.transaction('r', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) tables[t] = await db.table(t).toArray()
  })
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    tables,
  }
}

export function parseBackup(json: string): Backup {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    throw new Error('Die Datei ist kein gültiges JSON.')
  }
  const b = data as Partial<Backup>
  if (b?.format !== BACKUP_FORMAT) throw new Error('Die Datei ist kein Backup dieser App.')
  if (typeof b.version !== 'number' || b.version > BACKUP_VERSION) {
    throw new Error('Das Backup stammt von einer neueren App-Version.')
  }
  if (!b.tables || typeof b.tables !== 'object') throw new Error('Das Backup enthält keine Daten.')
  for (const t of TABLES) {
    const rows = (b.tables as Record<string, unknown>)[t]
    if (rows !== undefined && !Array.isArray(rows)) throw new Error(`Tabelle "${t}" ist beschädigt.`)
  }
  return b as Backup
}

/** Ersetzt den kompletten Datenbestand durch das Backup (alles oder nichts). */
export async function restoreBackup(db: TrackerDB, backup: Backup): Promise<void> {
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) {
      await db.table(t).clear()
      const rows = backup.tables[t] ?? []
      if (rows.length) await db.table(t).bulkAdd(rows)
    }
  })
}

export function backupFileName(date = new Date()): string {
  return `ausgaben-backup-${date.toISOString().slice(0, 10)}.json`
}
