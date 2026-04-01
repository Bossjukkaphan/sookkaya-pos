import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import AppShell from '@/components/AppShell'
import POSClient from './POSClient'

export default async function POSPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  return (
    <AppShell user={session}>
      <POSClient />
    </AppShell>
  )
}
