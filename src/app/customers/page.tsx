import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import AppShell from '@/components/AppShell'
import CustomersClient from './CustomersClient'

export default async function CustomersPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  return (
    <AppShell user={session}>
      <CustomersClient />
    </AppShell>
  )
}
