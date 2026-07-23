import Link from "next/link"

import { CustomerForm } from "../customer-form"

export const metadata = { title: "เพิ่มลูกค้า · สุขกายา POS" }

export default function NewCustomerPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/customers" className="text-sm text-slate-600 hover:underline">
        ← กลับไปรายชื่อลูกค้า
      </Link>
      <h1 className="text-xl font-bold">เพิ่มลูกค้าใหม่</h1>
      <CustomerForm />
    </div>
  )
}
