'use client'
import { useEffect, useState } from 'react'
import { formatBaht } from '@/lib/utils'
import Link from 'next/link'

const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

interface MonthData {
  revenue: number
  expense: number
  commission: number
  sessions: number
}

export default function DashboardClient({ role }: { role: string }) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [monthlyData, setMonthlyData] = useState<Record<number, MonthData>>({})
  const [todaySales, setTodaySales] = useState<{ total: number; sessions: number }>({ total: 0, sessions: 0 })
  const [bookingsToday, setBookingsToday] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [year])

  async function fetchData() {
    setLoading(true)
    const [reportRes, salesRes, bookRes] = await Promise.all([
      fetch(`/api/reports?type=monthly&year=${year}`),
      fetch(`/api/sales?date=${new Date().toISOString().split('T')[0]}&limit=200`),
      fetch(`/api/bookings?date=${new Date().toISOString().split('T')[0]}`),
    ])
    const [reportData, salesData, bookData] = await Promise.all([reportRes.json(), salesRes.json(), bookRes.json()])
    setMonthlyData(reportData.data || {})
    const today = salesData.sales || []
    setTodaySales({ total: today.reduce((s: number, x: { actualAmount: number }) => s + x.actualAmount, 0), sessions: today.length })
    setBookingsToday((bookData.bookings || []).length)
    setLoading(false)
  }

  const totalRevenue = Object.values(monthlyData).reduce((s, m) => s + (m?.revenue || 0), 0)
  const totalExpense = Object.values(monthlyData).reduce((s, m) => s + (m?.expense || 0), 0)
  const totalCommission = Object.values(monthlyData).reduce((s, m) => s + (m?.commission || 0), 0)
  const netProfit = totalRevenue - totalExpense
  const currentMonth = now.getMonth() + 1
  const curMonthData = monthlyData[currentMonth] || { revenue: 0, expense: 0, commission: 0, sessions: 0 }

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-800">📊 ภาพรวมธุรกิจ</h1>
        <select
          value={year}
          onChange={(e) => setYear(parseInt(e.target.value))}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
        >
          {[2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Today Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500 mb-1">💰 รายรับวันนี้</p>
          <p className="text-xl font-bold text-green-600">{formatBaht(todaySales.total)}</p>
          <p className="text-xs text-gray-400">{todaySales.sessions} session</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500 mb-1">📅 การจองวันนี้</p>
          <p className="text-xl font-bold text-blue-600">{bookingsToday}</p>
          <p className="text-xs text-gray-400">รายการ</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500 mb-1">📆 รายรับเดือนนี้</p>
          <p className="text-xl font-bold text-green-600">{formatBaht(curMonthData.revenue)}</p>
          <p className="text-xs text-gray-400">{curMonthData.sessions} session</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500 mb-1">📉 รายจ่ายเดือนนี้</p>
          <p className="text-xl font-bold text-red-500">{formatBaht(curMonthData.expense)}</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Link href="/pos" className="bg-green-600 text-white rounded-xl p-4 flex flex-col items-center gap-2 hover:bg-green-700 transition-colors">
          <span className="text-2xl">🛒</span>
          <span className="font-medium text-sm">บันทึกขาย</span>
        </Link>
        <Link href="/booking" className="bg-blue-600 text-white rounded-xl p-4 flex flex-col items-center gap-2 hover:bg-blue-700 transition-colors">
          <span className="text-2xl">📅</span>
          <span className="font-medium text-sm">จัดการจอง</span>
        </Link>
        <Link href="/expenses" className="bg-orange-500 text-white rounded-xl p-4 flex flex-col items-center gap-2 hover:bg-orange-600 transition-colors">
          <span className="text-2xl">💸</span>
          <span className="font-medium text-sm">บันทึกจ่าย</span>
        </Link>
        <Link href="/reports" className="bg-purple-600 text-white rounded-xl p-4 flex flex-col items-center gap-2 hover:bg-purple-700 transition-colors">
          <span className="text-2xl">📈</span>
          <span className="font-medium text-sm">รายงาน</span>
        </Link>
      </div>

      {role === 'owner' && (
        <>
          {/* Annual Summary */}
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-6">
            <h2 className="font-semibold text-gray-700 mb-4">📈 สรุปประจำปี {year}</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-gray-500">💚 รายรับรวม</p>
                <p className="text-lg font-bold text-green-600">{formatBaht(totalRevenue)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">🔴 รายจ่ายรวม</p>
                <p className="text-lg font-bold text-red-500">{formatBaht(totalExpense)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">💜 ค่ามือหมอรวม</p>
                <p className="text-lg font-bold text-purple-600">{formatBaht(totalCommission)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">💙 กำไรสุทธิ</p>
                <p className={`text-lg font-bold ${netProfit >= 0 ? 'text-blue-600' : 'text-red-600'}`}>{formatBaht(netProfit)}</p>
              </div>
            </div>
          </div>

          {/* Monthly Table */}
          {!loading && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-4 border-b">
                <h2 className="font-semibold text-gray-700">📋 สรุปรายเดือน</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-gray-600">เดือน</th>
                      <th className="px-4 py-2 text-right text-gray-600">รายรับ (฿)</th>
                      <th className="px-4 py-2 text-right text-gray-600">รายจ่าย (฿)</th>
                      <th className="px-4 py-2 text-right text-gray-600">ค่ามือ (฿)</th>
                      <th className="px-4 py-2 text-right text-gray-600">กำไร (฿)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                      const d = monthlyData[m] || { revenue: 0, expense: 0, commission: 0, sessions: 0 }
                      const profit = d.revenue - d.expense
                      return (
                        <tr key={m} className={`border-t ${m === currentMonth ? 'bg-green-50' : ''}`}>
                          <td className="px-4 py-2 font-medium">{THAI_MONTHS[m - 1]}</td>
                          <td className="px-4 py-2 text-right text-green-600">{d.revenue > 0 ? d.revenue.toLocaleString('th-TH') : '—'}</td>
                          <td className="px-4 py-2 text-right text-red-500">{d.expense > 0 ? d.expense.toLocaleString('th-TH') : '—'}</td>
                          <td className="px-4 py-2 text-right text-purple-600">{d.commission > 0 ? d.commission.toLocaleString('th-TH') : '—'}</td>
                          <td className={`px-4 py-2 text-right font-medium ${profit < 0 ? 'text-red-500' : profit > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                            {(d.revenue > 0 || d.expense > 0) ? profit.toLocaleString('th-TH') : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
