import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Account, type Category } from '../db/schema'
import type { IconName } from '../components/Icon'

/** Konten und Kategorien (sortiert) plus schnelle Nachschlage-Tabellen. */
export function useFinanceRefs() {
  return useLiveQuery(async () => {
    const [accounts, categories] = await Promise.all([db.accounts.orderBy('order').toArray(), db.categories.orderBy('order').toArray()])
    return {
      accounts,
      /** ohne ausgeblendete Konten */
      visibleAccounts: accounts.filter((a) => !a.hidden),
      categories,
      accountById: new Map(accounts.map((a) => [a.id, a])),
      categoryById: new Map(categories.map((c) => [c.id, c])),
    }
  })
}

export function accountIcon(kind: Account['kind']): IconName {
  return ({ giro: 'wallet', savings: 'piggy', depot: 'chart', credit: 'card', paypal: 'swap', cash: 'cash' } as const)[kind]
}

export function categoryIcon(c: Category | undefined): IconName {
  return (c?.icon as IconName) ?? 'tag'
}

export const categoryColor = (c: Category | undefined) => `var(--${c?.color ?? 'cat-10'})`
