'use client'
import { useEffect, useState } from 'react'
import { formatBaht } from '@/lib/utils'

const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const THAI_MONTHS_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']

export default function ReportsClient() {
  const now = new Date()
  const [reportType, setReportType] = useState<'daily' | 'therapist' | 'service'>('daily')
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [data, setData] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => { fetchReport() }, [reportType, month, year])

  async function fetchReport() {
    setLoading(true)
    const res = await fetch(`/api/reports?type=${reportType}&year=${year}&month=${month}`)
    const d = await res.json()
    setData(d.data || {})
    setLoading(false)
  }

  interface DayData { revenue: number; expense: number; commission: number; sessions: number }
  interface TherapistRow { therapist: { name: string }; sessions: number; revenue: number; commission: number }
  interface ServiceRow { service: { name: string }; sessions: number; revenue: number }

  const dailyData = data as Record<string, DayData>
  const therapistData = data as unknown as TherapistRow[]
  const serviceData = data as unknown as ServiceRow[]

  const totalRevenue = reportType === 'daily' ? Object.values(dailyData).reduce((s, d) => s + ((d as DayData).revenue || 0), 0) : 0
  const totalExpense = reportType === 'daily' ? Object.values(dailyData).reduce((s, d) => s + ((d as DayData).expense || 0), 0) : 0

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-800">📈 รายงาน</h1>
        {reportType === 'daily' && (
          <a href={`/api/export?type=sales&year=${year}&month=${month}`}
            className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-1">
            Export Excel
          </a>
        )}
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))} className="border rounded-lg px-3 py-2 text-sm">
          {THAI_MONTHS_FULL.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <select value={year} onChange={(e) => setYear(parseInt(e.target.value))} className="border rounded-lg px-3 py-2 text-sm">
          {[2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <div className="flex gap-1">
          {(['daily', 'therapist', 'service'] as const).map((t) => (
            <button key={t} onClick={() => setReportType(t)}
              className={`px-3 py-2 rounded-lg text-sm ${reportType === t ? 'bg-green-600 text-white' : 'bg-white border text-gray-600'}`}>
              {t === 'daily' ? 'รายวัน' : t === 'therapist' ? 'หมอนวด' : 'บริการ'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-400">กำลังโหลด...</div>
      ) : (
        <>
          {reportType === 'daily' && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="bg-white rounded-xl p-3 shadow-sm border">
                  <p className="text-xs text-gray-500">รายรับรวม</p>
                  <p className="text-lg font-bold text-green-600">{formatBaht(totalRevenue)}</p>
                </div>
                <div className="bg-white rounded-xl p-3 shadow-sm border">
                  <p className="text-xs text-gray-500">รายจ่ายรวม</p>
                  <p className="text-lg font-bold text-red-500">{formatBaht(totalExpense)}</p>
                </div>
                <div className="bg-white rounded-xl p-3 shadow-sm border">
                  <p className="text-xs text-gray-500">กำไรสุทธิ</p>
                  <p className={`text-lg font-bold ${totalRevenue - totalExpense >= 0 ? 'text-blue-600' : 'text-red-600'}`}>{formatBaht(totalRevenue - totalExpense)}</p>
                </div>
                <div className="bg-white rounded-xl p-3 shadow-sm border">
                  <p className="text-xs text-gray-500">Session รวม</p>
                  <p className="text-lg font-bold text-purple-600">{Object.values(dailyData).reduce((s, d) => s + ((d as DayData).sessions || 0), 0)}</p>
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500">
                    <tr>
                      <th className="px-4 py-2 text-left">วันที่</th>
                      <th className="px-4 py-2 text-center">Session</th>
                      <th className="px-4 py-2 text-right">รายรับ</th>
                      <th className="px-4 py-2 text-right">รายจ่าย</th>
                      <th className="px-4 py-2 text-right">กำไร</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {Object.entries(dailyData).sort(([a], [b]) => a.localeCompare(b)).map(([dateStr, d]) => {
                      const dd = d as DayData
                      const profit = dd.revenue - dd.expense
                      return (
                        <tr key={dateStr}>
                          <td className="px-4 py-2">{new Date(dateStr).toLocaleDateString('th-TH')}</td>
                          <td className="px-4 py-2 text-center">{dd.sessions}</td>
                          <td className="px-4 py-2 text-right text-green-600">{dd.revenue > 0 ? dd.revenue.toLocaleString('th-TH') : '—'}</td>
                          <td className="px-4 py-2 text-right text-red-500">{dd.expense > 0 ? dd.expense.toLocaleString('th-TH') : '—'}</td>
                          <td className={`px-4 py-2 text-right font-medium ${profit < 0 ? 'text-red-500' : 'text-blue-600'}`}>{(dd.revenue > 0 || dd.expense > 0) ? profit.toLocaleString('th-TH') : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {reportType === 'therapist' && Array.isArray(data) && (
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="px-4 py-2 text-left">หมอนวด</th>
                    <th className="px-4 py-2 text-center">Session</th>
                    <th className="px-4 py-2 text-right">รายรับ</th>
                    <th className="px-4 py-2 text-right">ค่ามือ</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(therapistData as TherapistRow[]).sort((a, b) => b.revenue - a.revenue).map((row, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2.5 font-medium">{row.therapist?.name}</td>
                      <td className="px-4 py-2.5 text-center">{row.sessions}</td>
                      <td className="px-4 py-2.5 text-right text-green-600">{row.revenue.toLocaleString('th-TH')}</td>
                      <td className="px-4 py-2.5 text-right text-purple-600">{row.commission.toLocaleString('th-TH')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {reportType === 'service' && Array.isArray(data) && (
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="px-4 py-2 text-left">บริการ</th>
                    <th className="px-4 py-2 text-center">Session</th>
                    <th className="px-4 py-2 text-right">รายรับ</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(serviceData as ServiceRow[]).sort((a, b) => b.sessions - a.sessions).map((row, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2.5 font-medium text-sm">{row.service?.name}</td>
                      <td className="px-4 py-2.5 text-center">{row.sessions}</td>
                      <td className="px-4 py-2.5 text-right text-green-600">{row.revenue.toLocaleString('th-TH')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
