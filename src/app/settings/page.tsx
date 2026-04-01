import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import AppShell from '@/components/AppShell'
import SettingsClient from './SettingsClient'

export default async function SettingsPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  return (
    <AppShell user={session}>
      <SettingsClient role={session.role} />
    </AppShell>
  )
}
