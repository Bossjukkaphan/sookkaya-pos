import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import AppShell from '@/components/AppShell'
import TherapistsClient from './TherapistsClient'

export default async function TherapistsPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  return (
    <AppShell user={session}>
      <TherapistsClient role={session.role} />
    </AppShell>
  )
}
