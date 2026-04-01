'use client'
import { useEffect, useState } from 'react'
import { formatBaht } from '@/lib/utils'

interface Therapist { id: number; name: string; type: string; dailyMinimum: number; active: boolean }
interface PayResult {
  therapist: Therapist
  days: number
  sessions: number
  commission: number
  guarantee: number
  requestFees: number
  netPay: number
}

export default function TherapistsClient({ role }: { role: string }) {
  const [therapists, setTherapists] = useState<Therapist[]>([])
  const [payResults, setPayResults] = useState<PayResult[]>([])
  const [tab, setTab] = useState<'list' | 'pay'>('list')
  const now = new Date()
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(now.getFullYear(), now.getMonth(), 1)
    return d.toISOString().split('T')[0]
  })
  const [endDate, setEndDate] = useState(now.toISOString().split('T')[0])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/therapists?all=true').then((r) => r.json()).then((d) => setTherapists(d.therapists || []))
  }, [])

  async function calcPay() {
    setLoading(true)
    const res = await fetch(`/api/therapists/pay?startDate=${startDate}&endDate=${endDate}`)
    const data = await res.json()
    setPayResults(data.results || [])
    setLoading(false)
  }

  async function toggleActive(id: number, active: boolean) {
    await fetch(`/api/therapists/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active }) })
    const res = await fetch('/api/therapists?all=true')
    const data = await res.json()
    setTherapists(data.therapists || [])
  }

  const totalPay = payResults.reduce((s, r) => s + r.netPay, 0)

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-800">💆 หมอนวด</h1>
        <div className="flex gap-2">
          <button onClick={() => setTab('list')} className={`px-3 py-1.5 rounded-lg text-sm ${tab === 'list' ? 'bg-green-600 text-white' : 'bg-white border text-gray-600'}`}>รายชื่อ</button>
          <button onClick={() => { setTab('pay'); calcPay() }} className={`px-3 py-1.5 rounded-lg text-sm ${tab === 'pay' ? 'bg-green-600 text-white' : 'bg-white border text-gray-600'}`}>คำนวณค่ามือ</button>
        </div>
      </div>

      {tab === 'list' && (
        <div className="space-y-3">
          {therapists.map((t) => (
            <div key={t.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium text-gray-800">{t.name}</p>
                  {t.type === 'freelance' && <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">Freelance</span>}
                  {!t.active && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">ไม่ active</span>}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">ประกันมือขั้นต่ำ: {t.dailyMinimum.toLocaleString('th-TH')} ฿/วัน</p>
              </div>
              {role === 'owner' && (
                <button onClick={() => toggleActive(t.id, !t.active)}
                  className={`text-xs px-3 py-1 rounded-full ${t.active ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                  {t.active ? '✅ Active' : 'Inactive'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'pay' && (
        <div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">📅 ตั้งช่วงเวลา</h3>
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="text-xs text-gray-500">วันเริ่มต้น</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="block border rounded-lg px-3 py-2 text-sm mt-1" />
              </div>
              <div>
                <label className="text-xs text-gray-500">วันสิ้นสุด</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="block border rounded-lg px-3 py-2 text-sm mt-1" />
              </div>
              <button onClick={calcPay} disabled={loading} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
                {loading ? 'กำลังคำนวณ...' : '🔢 คำนวณ'}
              </button>
              {payResults.length > 0 && (
                <a href={`/api/export?type=therapist-pay&startDate=${startDate}&endDate=${endDate}`}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">Export</a>
              )}
            </div>
            <div className="mt-3 flex gap-2 flex-wrap text-xs">
              <button onClick={() => { const d = new Date(now.getFullYear(), now.getMonth(), 1); setStartDate(d.toISOString().split('T')[0]); setEndDate(new Date(now.getFullYear(), now.getMonth(), 10).toISOString().split('T')[0]) }} className="bg-gray-100 px-2 py-1 rounded">1–10</button>
              <button onClick={() => { setStartDate(new Date(now.getFullYear(), now.getMonth(), 11).toISOString().split('T')[0]); setEndDate(new Date(now.getFullYear(), now.getMonth(), 20).toISOString().split('T')[0]) }} className="bg-gray-100 px-2 py-1 rounded">11–20</button>
              <button onClick={() => { setStartDate(new Date(now.getFullYear(), now.getMonth(), 21).toISOString().split('T')[0]); setEndDate(new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]) }} className="bg-gray-100 px-2 py-1 rounded">21–สิ้นเดือน</button>
            </div>
          </div>

          {payResults.length > 0 && (
            <>
              <div className="overflow-x-auto bg-white rounded-xl shadow-sm border border-gray-100 mb-4">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500">
                    <tr>
                      <th className="px-4 py-2 text-left">หมอนวด</th>
                      <th className="px-4 py-2 text-center">วัน</th>
                      <th className="px-4 py-2 text-center">Session</th>
                      <th className="px-4 py-2 text-right">ค่ามือจริง</th>
                      <th className="px-4 py-2 text-right">ประกัน</th>
                      <th className="px-4 py-2 text-right">รีเควส</th>
                      <th className="px-4 py-2 text-right font-bold text-green-700">ยอดจ่าย</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {payResults.filter(r => r.days > 0).map((r) => (
                      <tr key={r.therapist.id}>
                        <td className="px-4 py-2.5 font-medium">{r.therapist.name}</td>
                        <td className="px-4 py-2.5 text-center">{r.days}</td>
                        <td className="px-4 py-2.5 text-center">{r.sessions}</td>
                        <td className="px-4 py-2.5 text-right">{r.commission.toLocaleString('th-TH')}</td>
                        <td className="px-4 py-2.5 text-right text-gray-400">{r.guarantee.toLocaleString('th-TH')}</td>
                        <td className="px-4 py-2.5 text-right text-blue-500">{r.requestFees > 0 ? r.requestFees.toLocaleString('th-TH') : '—'}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-green-600">{formatBaht(r.netPay)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 font-bold">
                    <tr>
                      <td className="px-4 py-2.5" colSpan={6}>รวมทั้งหมด</td>
                      <td className="px-4 py-2.5 text-right text-green-600">{formatBaht(totalPay)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="text-xs text-gray-400 text-center">* ยอดจ่าย = MAX(ค่ามือจริง, ประกันขั้นต่ำ/วัน) + ค่ารีเควส</p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
