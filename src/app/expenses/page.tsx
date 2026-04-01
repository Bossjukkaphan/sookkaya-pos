import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import AppShell from '@/components/AppShell'
import ExpensesClient from './ExpensesClient'

export default async function ExpensesPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  return (
    <AppShell user={session}>
      <ExpensesClient />
    </AppShell>
  )
}
