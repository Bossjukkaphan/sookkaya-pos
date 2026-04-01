import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import AppShell from '@/components/AppShell'
import DashboardClient from './DashboardClient'

export default async function DashboardPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  return (
    <AppShell user={session}>
      <DashboardClient role={session.role} />
    </AppShell>
  )
}
