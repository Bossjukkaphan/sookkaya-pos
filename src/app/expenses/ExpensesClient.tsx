'use client'
import { useEffect, useState } from 'react'
import { EXPENSE_CATEGORIES, formatBaht } from '@/lib/utils'

interface Expense { id: number; date: string; description: string; category: string; amount: number; paidBy?: string; notes?: string }

export default function ExpensesClient() {
  const now = new Date()
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ date: now.toISOString().split('T')[0], description: '', category: EXPENSE_CATEGORIES[0], amount: '', paidBy: '', notes: '' })
  const [editId, setEditId] = useState<number | null>(null)

  useEffect(() => { loadExpenses() }, [month, year])

  async function loadExpenses() {
    const res = await fetch(`/api/expenses?month=${month}&year=${year}`)
    const data = await res.json()
    setExpenses(data.expenses || [])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    if (editId) {
      await fetch(`/api/expenses/${editId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, amount: parseFloat(form.amount) }) })
    } else {
      await fetch('/api/expenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, amount: parseFloat(form.amount) }) })
    }
    setShowForm(false)
    setEditId(null)
    setForm({ date: now.toISOString().split('T')[0], description: '', category: EXPENSE_CATEGORIES[0], amount: '', paidBy: '', notes: '' })
    await loadExpenses()
    setLoading(false)
  }

  async function deleteExpense(id: number) {
    if (!confirm('ลบรายการนี้?')) return
    await fetch(`/api/expenses/${id}`, { method: 'DELETE' })
    loadExpenses()
  }

  function startEdit(e: Expense) {
    setForm({ date: e.date.split('T')[0], description: e.description, category: e.category, amount: String(e.amount), paidBy: e.paidBy || '', notes: e.notes || '' })
    setEditId(e.id)
    setShowForm(true)
  }

  const total = expenses.reduce((s, e) => s + e.amount, 0)
  const byCategory: Record<string, number> = {}
  for (const e of expenses) byCategory[e.category] = (byCategory[e.category] || 0) + e.amount

  const THAI_MONTHS_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-800">💸 รายจ่าย</h1>
        <div className="flex gap-2">
          <a href={`/api/export?type=expenses&year=${year}&month=${month}`}
            className="bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">Export</a>
          <button onClick={() => { setEditId(null); setShowForm(true) }} className="bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-600">+ บันทึกรายจ่าย</button>
        </div>
      </div>

      <div className="flex gap-3 items-center mb-4">
        <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))} className="border rounded-lg px-3 py-2 text-sm">
          {THAI_MONTHS_FULL.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <select value={year} onChange={(e) => setYear(parseInt(e.target.value))} className="border rounded-lg px-3 py-2 text-sm">
          {[2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <span className="text-sm font-semibold text-red-500">{formatBaht(total)}</span>
      </div>

      {/* Category Summary */}
      {Object.keys(byCategory).length > 0 && (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">สรุปตามหมวดหมู่</h3>
          <div className="space-y-2">
            {Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => (
              <div key={cat} className="flex justify-between text-sm">
                <span className="text-gray-600">{cat}</span>
                <span className="font-medium text-red-500">{formatBaht(amt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="font-bold text-gray-800 mb-4">{editId ? '✏️ แก้ไขรายจ่าย' : '+ บันทึกรายจ่าย'}</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500">วันที่</label>
                  <input type="date" value={form.date} onChange={(e) => setForm({...form, date: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" required />
                </div>
                <div>
                  <label className="text-xs text-gray-500">จำนวน (฿) *</label>
                  <input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({...form, amount: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" required />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500">รายการ *</label>
                <input value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" required />
              </div>
              <div>
                <label className="text-xs text-gray-500">หมวดหมู่</label>
                <select value={form.category} onChange={(e) => setForm({...form, category: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm mt-1">
                  {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">จ่ายโดย</label>
                <input value={form.paidBy} onChange={(e) => setForm({...form, paidBy: e.target.value})} placeholder="เช่น Tee" className="w-full border rounded-lg px-3 py-2 text-sm mt-1" />
              </div>
              <div>
                <label className="text-xs text-gray-500">หมายเหตุ</label>
                <textarea value={form.notes} onChange={(e) => setForm({...form, notes: e.target.value})} rows={2} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => { setShowForm(false); setEditId(null) }} className="flex-1 border text-gray-600 py-2 rounded-lg text-sm">ยกเลิก</button>
                <button type="submit" disabled={loading} className="flex-1 bg-red-500 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50">บันทึก</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Expense List */}
      <div className="space-y-2">
        {expenses.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center text-gray-400 shadow-sm border">ไม่มีรายจ่ายในเดือนนี้</div>
        ) : expenses.map((e) => (
          <div key={e.id} className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 flex items-start justify-between">
            <div>
              <p className="font-medium text-gray-800 text-sm">{e.description}</p>
              <p className="text-xs text-gray-500">{new Date(e.date).toLocaleDateString('th-TH')} · {e.category}</p>
              {e.paidBy && <p className="text-xs text-gray-400">จ่ายโดย: {e.paidBy}</p>}
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-red-500 text-sm">{formatBaht(e.amount)}</span>
              <button onClick={() => startEdit(e)} className="text-gray-300 hover:text-blue-400 text-xs px-1">✏️</button>
              <button onClick={() => deleteExpense(e.id)} className="text-gray-300 hover:text-red-400 text-xs px-1">🗑️</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
