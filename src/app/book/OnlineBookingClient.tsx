'use client'
import { useEffect, useState } from 'react'

interface Service { id: number; name: string; price: number; durationMin: number }

export default function OnlineBookingClient() {
  const [services, setServices] = useState<Service[]>([])
  const [form, setForm] = useState({ customerName: '', customerPhone: '', serviceId: '', date: '', time: '10:00', notes: '' })
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const times = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00']

  useEffect(() => {
    fetch('/api/services').then((r) => r.json()).then((d) => setServices(d.services || []))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, serviceId: parseInt(form.serviceId), source: 'online', status: 'pending' }),
    })
    if (res.ok) {
      setSubmitted(true)
    } else {
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่')
    }
    setLoading(false)
  }

  const selectedService = services.find((s) => s.id === parseInt(form.serviceId))
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const minDate = tomorrow.toISOString().split('T')[0]

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full text-center">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">จองสำเร็จแล้ว!</h2>
          <p className="text-gray-600 text-sm mb-4">ทางร้านได้รับการจองของคุณแล้ว จะติดต่อยืนยันนัดอีกครั้ง</p>
          <div className="bg-green-50 rounded-xl p-4 text-sm text-left space-y-2 mb-6">
            <div className="flex justify-between"><span className="text-gray-500">ชื่อ</span><span>{form.customerName}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">บริการ</span><span className="text-right">{selectedService?.name}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">วัน/เวลา</span><span>{new Date(form.date).toLocaleDateString('th-TH')} {form.time}</span></div>
          </div>
          <button onClick={() => { setSubmitted(false); setForm({ customerName: '', customerPhone: '', serviceId: '', date: '', time: '10:00', notes: '' }) }}
            className="w-full bg-green-600 text-white py-2.5 rounded-xl font-medium hover:bg-green-700">
            จองอีกครั้ง
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 p-4">
      <div className="max-w-md mx-auto">
        <div className="text-center py-8">
          <div className="text-5xl mb-3">🌿</div>
          <h1 className="text-2xl font-bold text-gray-800">SOOKKAYA</h1>
          <p className="text-gray-500 text-sm mt-1">Thai Massage — นัดหมายออนไลน์</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6">
          <h2 className="font-bold text-gray-800 mb-5">📅 จองนัดนวด</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อของคุณ *</label>
              <input value={form.customerName} onChange={(e) => setForm({...form, customerName: e.target.value})}
                placeholder="ชื่อ-นามสกุล" className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">เบอร์โทรศัพท์ *</label>
              <input type="tel" value={form.customerPhone} onChange={(e) => setForm({...form, customerPhone: e.target.value})}
                placeholder="0812345678" className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">บริการที่ต้องการ *</label>
              <select value={form.serviceId} onChange={(e) => setForm({...form, serviceId: e.target.value})}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" required>
                <option value="">-- เลือกบริการ --</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} — {s.price.toLocaleString('th-TH')} ฿</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">วันที่นัด *</label>
                <input type="date" min={minDate} value={form.date} onChange={(e) => setForm({...form, date: e.target.value})}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">เวลา *</label>
                <select value={form.time} onChange={(e) => setForm({...form, time: e.target.value})}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                  {times.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ความต้องการพิเศษ</label>
              <textarea value={form.notes} onChange={(e) => setForm({...form, notes: e.target.value})} rows={2}
                placeholder="เช่น แพ้น้ำมัน, ต้องการหมอหญิง..." className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full bg-green-600 text-white py-3 rounded-xl font-bold hover:bg-green-700 disabled:opacity-50 transition-colors text-base">
              {loading ? 'กำลังส่ง...' : '📅 ยืนยันการนัดหมาย'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6 pb-8">ทางร้านจะติดต่อยืนยันนัดภายใน 24 ชั่วโมง</p>
      </div>
    </div>
  )
}
