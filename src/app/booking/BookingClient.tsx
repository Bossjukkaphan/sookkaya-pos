'use client'
import { useEffect, useState } from 'react'
import { BOOKING_STATUSES } from '@/lib/utils'

interface Service { id: number; name: string; price: number; durationMin: number }
interface Therapist { id: number; name: string }
interface Booking {
  id: number; date: string; time: string; customerName: string; customerPhone?: string
  status: string; source: string; notes?: string
  service: Service; therapist?: Therapist
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
}

export default function BookingClient() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [therapists, setTherapists] = useState<Therapist[]>([])
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ customerName: '', customerPhone: '', serviceId: '', therapistId: '', date: new Date().toISOString().split('T')[0], time: '10:00', notes: '', status: 'confirmed', source: 'walkin' })

  useEffect(() => {
    Promise.all([fetch('/api/services').then((r) => r.json()), fetch('/api/therapists').then((r) => r.json())])
      .then(([s, t]) => { setServices(s.services || []); setTherapists(t.therapists || []) })
    loadBookings()
  }, [selectedDate])

  async function loadBookings() {
    const res = await fetch(`/api/bookings?date=${selectedDate}`)
    const data = await res.json()
    setBookings(data.bookings || [])
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, serviceId: parseInt(form.serviceId), therapistId: form.therapistId ? parseInt(form.therapistId) : null }),
    })
    setShowForm(false)
    setForm({ customerName: '', customerPhone: '', serviceId: '', therapistId: '', date: selectedDate, time: '10:00', notes: '', status: 'confirmed', source: 'walkin' })
    await loadBookings()
    setLoading(false)
  }

  async function updateStatus(id: number, status: string) {
    await fetch(`/api/bookings/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
    loadBookings()
  }

  async function deleteBooking(id: number) {
    if (!confirm('ลบการจองนี้?')) return
    await fetch(`/api/bookings/${id}`, { method: 'DELETE' })
    loadBookings()
  }

  const times = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00']
  const bookingsByTime: Record<string, Booking[]> = {}
  for (const b of bookings) {
    const h = b.time.substring(0, 5)
    if (!bookingsByTime[h]) bookingsByTime[h] = []
    bookingsByTime[h].push(b)
  }

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-800">📅 การจอง</h1>
        <button onClick={() => setShowForm(true)} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700">+ จองใหม่</button>
      </div>

      <div className="flex gap-3 items-center mb-4">
        <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        <span className="text-sm text-gray-500">{bookings.length} รายการ</span>
        <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full">{bookings.filter(b => b.source === 'online').length} ออนไลน์</span>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="font-bold text-gray-800 mb-4">📅 จองนัด</h2>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500">วันที่</label>
                  <input type="date" value={form.date} onChange={(e) => setForm({...form, date: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" required />
                </div>
                <div>
                  <label className="text-xs text-gray-500">เวลา</label>
                  <select value={form.time} onChange={(e) => setForm({...form, time: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm mt-1">
                    {times.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500">ชื่อลูกค้า *</label>
                <input value={form.customerName} onChange={(e) => setForm({...form, customerName: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" required />
              </div>
              <div>
                <label className="text-xs text-gray-500">เบอร์โทร</label>
                <input type="tel" value={form.customerPhone} onChange={(e) => setForm({...form, customerPhone: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" />
              </div>
              <div>
                <label className="text-xs text-gray-500">บริการ *</label>
                <select value={form.serviceId} onChange={(e) => setForm({...form, serviceId: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" required>
                  <option value="">-- เลือกบริการ --</option>
                  {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">หมอนวด</label>
                <select value={form.therapistId} onChange={(e) => setForm({...form, therapistId: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm mt-1">
                  <option value="">-- ไม่ระบุ --</option>
                  {therapists.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">แหล่งที่มา</label>
                <select value={form.source} onChange={(e) => setForm({...form, source: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm mt-1">
                  <option value="walkin">Walk-in / โทรมา</option>
                  <option value="online">ออนไลน์</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">หมายเหตุ</label>
                <textarea value={form.notes} onChange={(e) => setForm({...form, notes: e.target.value})} rows={2} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 border border-gray-300 text-gray-600 py-2 rounded-lg text-sm">ยกเลิก</button>
                <button type="submit" disabled={loading} className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50">บันทึก</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Timeline View */}
      <div className="space-y-2">
        {bookings.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center text-gray-400 shadow-sm border">ไม่มีการจองวันนี้</div>
        ) : (
          times.filter(t => bookingsByTime[t]).map((t) => (
            <div key={t}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold text-gray-400 w-12">{t}</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>
              {(bookingsByTime[t] || []).map((b) => (
                <div key={b.id} className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 mb-2 ml-14">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[b.status]}`}>{BOOKING_STATUSES[b.status as keyof typeof BOOKING_STATUSES]?.label}</span>
                        {b.source === 'online' && <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">🌐 ออนไลน์</span>}
                      </div>
                      <p className="font-medium text-gray-800">{b.customerName}</p>
                      <p className="text-xs text-gray-500">{b.service?.name} · {b.therapist?.name || 'ยังไม่ระบุหมอ'}</p>
                      {b.customerPhone && <p className="text-xs text-gray-400">📞 {b.customerPhone}</p>}
                      {b.notes && <p className="text-xs text-orange-500 mt-1">💬 {b.notes}</p>}
                    </div>
                    <div className="flex flex-col gap-1">
                      {b.status === 'pending' && (
                        <button onClick={() => updateStatus(b.id, 'confirmed')} className="text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded hover:bg-blue-200">ยืนยัน</button>
                      )}
                      {b.status === 'confirmed' && (
                        <button onClick={() => updateStatus(b.id, 'completed')} className="text-xs bg-green-100 text-green-600 px-2 py-1 rounded hover:bg-green-200">เสร็จ</button>
                      )}
                      {b.status !== 'cancelled' && b.status !== 'completed' && (
                        <button onClick={() => updateStatus(b.id, 'cancelled')} className="text-xs bg-red-100 text-red-500 px-2 py-1 rounded hover:bg-red-200">ยกเลิก</button>
                      )}
                      <button onClick={() => deleteBooking(b.id)} className="text-xs text-gray-300 hover:text-red-400 px-2 py-1">🗑️</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
