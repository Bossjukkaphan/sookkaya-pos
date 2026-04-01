'use client'
import { useEffect, useState } from 'react'
import { formatBaht } from '@/lib/utils'

interface Customer {
  id: number; name: string; nickname?: string; phone?: string; lineId?: string
  birthday?: string; notes?: string
  _count: { sales: number }
  sales: { id: number; date: string; actualAmount: number; service: { name: string }; therapist: { name: string } }[]
}

export default function CustomersClient() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Customer | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', nickname: '', phone: '', lineId: '', birthday: '', notes: '' })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadCustomers()
  }, [search])

  async function loadCustomers() {
    const q = search.length >= 2 ? `?q=${encodeURIComponent(search)}` : ''
    const res = await fetch(`/api/customers${q}`)
    const data = await res.json()
    setCustomers(data.customers || [])
  }

  async function loadCustomer(id: number) {
    const res = await fetch(`/api/customers/${id}`)
    const data = await res.json()
    setSelected(data.customer)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    await fetch('/api/customers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    setShowForm(false)
    setForm({ name: '', nickname: '', phone: '', lineId: '', birthday: '', notes: '' })
    await loadCustomers()
    setLoading(false)
  }

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-800">👤 ลูกค้า (CRM)</h1>
        <div className="flex gap-2">
          <a href="/api/export?type=customers"
            className="bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">Export</a>
          <button onClick={() => setShowForm(true)} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700">+ เพิ่มลูกค้า</button>
        </div>
      </div>

      <div className="mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 ค้นหาชื่อหรือเบอร์โทร..."
          className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        />
      </div>

      {/* Add Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="font-bold text-gray-800 mb-4">+ เพิ่มลูกค้าใหม่</h2>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="text-xs text-gray-500">ชื่อ-นามสกุล *</label>
                <input value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500">ชื่อเล่น</label>
                  <input value={form.nickname} onChange={(e) => setForm({...form, nickname: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">เบอร์โทร</label>
                  <input type="tel" value={form.phone} onChange={(e) => setForm({...form, phone: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500">Line ID</label>
                  <input value={form.lineId} onChange={(e) => setForm({...form, lineId: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">วันเกิด</label>
                  <input type="date" value={form.birthday} onChange={(e) => setForm({...form, birthday: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500">หมายเหตุ</label>
                <textarea value={form.notes} onChange={(e) => setForm({...form, notes: e.target.value})} rows={2} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 border text-gray-600 py-2 rounded-lg text-sm">ยกเลิก</button>
                <button type="submit" disabled={loading} className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50">บันทึก</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customer List */}
      <div className="grid gap-2">
        {customers.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center text-gray-400 shadow-sm border">ไม่พบลูกค้า</div>
        ) : customers.map((c) => (
          <div key={c.id} onClick={() => loadCustomer(c.id)}
            className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors">
            <div>
              <p className="font-medium text-gray-800">{c.name} {c.nickname ? `(${c.nickname})` : ''}</p>
              <p className="text-xs text-gray-500">{c.phone || 'ไม่ระบุเบอร์'} · มาแล้ว {c._count.sales} ครั้ง</p>
            </div>
            <div className="text-right">
              {c._count.sales > 0 && <p className="text-sm font-semibold text-green-600">{formatBaht(c.sales[0]?.actualAmount || 0)}</p>}
              <p className="text-xs text-gray-400">ล่าสุด</p>
            </div>
          </div>
        ))}
      </div>

      {/* Customer Detail Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center">
          <div className="bg-white rounded-t-2xl md:rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl">
            <div className="p-4 border-b flex items-center justify-between">
              <div>
                <h2 className="font-bold text-gray-800">{selected.name}</h2>
                {selected.phone && <p className="text-sm text-gray-500">📞 {selected.phone}</p>}
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="p-4 border-b grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-green-600">{selected._count.sales}</p>
                <p className="text-xs text-gray-500">ครั้งทั้งหมด</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-700">{selected.lineId || '—'}</p>
                <p className="text-xs text-gray-500">Line ID</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-700">{selected.birthday || '—'}</p>
                <p className="text-xs text-gray-500">วันเกิด</p>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <h3 className="text-sm font-semibold text-gray-600 mb-3">ประวัติการใช้บริการ</h3>
              <div className="space-y-2">
                {selected.sales.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-4">ยังไม่มีประวัติ</p>
                ) : selected.sales.map((s) => (
                  <div key={s.id} className="flex justify-between text-sm py-2 border-b border-gray-50">
                    <div>
                      <p className="font-medium text-gray-800">{s.service?.name}</p>
                      <p className="text-xs text-gray-500">{new Date(s.date).toLocaleDateString('th-TH')} · {s.therapist?.name}</p>
                    </div>
                    <span className="font-semibold text-green-600">{formatBaht(s.actualAmount)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
