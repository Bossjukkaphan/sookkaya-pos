import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import AppShell from '@/components/AppShell'
import ReportsClient from './ReportsClient'

export default async function ReportsPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  return (
    <AppShell user={session}>
      <ReportsClient />
    </AppShell>
  )
}
