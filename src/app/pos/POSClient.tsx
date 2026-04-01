'use client'
import { useEffect, useState, useCallback } from 'react'
import { PAYMENT_METHODS, formatBaht } from '@/lib/utils'

interface Service { id: number; name: string; price: number; commission: number; durationMin: number }
interface Therapist { id: number; name: string; type: string }
interface Promotion { id: number; name: string; type: string; value: number; description?: string }
interface Customer { id: number; name: string; phone?: string; nickname?: string }
interface Sale {
  id: number; receiptNo: string; date: string; time: string
  therapist: { name: string }; service: { name: string }
  customerName?: string; normalPrice: number; discount: number
  actualAmount: number; commission: number; paymentMethod: string
  isRequest: boolean; requestFee: number; promoLabel?: string
}

export default function POSClient() {
  const [services, setServices] = useState<Service[]>([])
  const [therapists, setTherapists] = useState<Therapist[]>([])
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [todaySales, setTodaySales] = useState<Sale[]>([])
  const [view, setView] = useState<'form' | 'receipt' | 'history'>('form')
  const [lastSale, setLastSale] = useState<Sale | null>(null)
  const [loading, setLoading] = useState(false)

  // Form state
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [time, setTime] = useState(() => {
    const now = new Date()
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
  })
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [therapistId, setTherapistId] = useState<number | null>(null)
  const [serviceId, setServiceId] = useState<number | null>(null)
  const [promotionId, setPromotionId] = useState<number | null>(null)
  const [manualDiscount, setManualDiscount] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState('QR Code')
  const [isRequest, setIsRequest] = useState(false)
  const [custSearch, setCustSearch] = useState('')

  const selectedService = services.find((s) => s.id === serviceId)
  const selectedPromo = promotions.find((p) => p.id === promotionId)

  const computedDiscount = useCallback(() => {
    if (!selectedService) return 0
    if (selectedPromo) {
      if (selectedPromo.type === 'percent') return Math.round(selectedService.price * selectedPromo.value / 100)
      if (selectedPromo.type === 'fixed') return selectedPromo.value
      if (selectedPromo.type === 'free_session') return selectedService.price
    }
    return manualDiscount
  }, [selectedService, selectedPromo, manualDiscount])

  const discount = computedDiscount()
  const normalPrice = selectedService?.price || 0
  const actualAmount = Math.max(0, normalPrice - discount)
  const commission = selectedService?.commission || 0
  const requestFee = isRequest ? 40 : 0

  useEffect(() => {
    Promise.all([
      fetch('/api/services').then((r) => r.json()),
      fetch('/api/therapists').then((r) => r.json()),
      fetch('/api/promotions').then((r) => r.json()),
    ]).then(([s, t, p]) => {
      setServices(s.services || [])
      setTherapists(t.therapists || [])
      setPromotions(p.promotions || [])
    })
    loadTodaySales()
  }, [])

  async function loadTodaySales() {
    const today = new Date().toISOString().split('T')[0]
    const res = await fetch(`/api/sales?date=${today}&limit=100`)
    const data = await res.json()
    setTodaySales(data.sales || [])
  }

  const filteredCustomers = custSearch.length >= 2
    ? customers.filter((c) => c.name.includes(custSearch) || (c.phone || '').includes(custSearch))
    : []

  useEffect(() => {
    if (custSearch.length >= 2) {
      fetch(`/api/customers?q=${encodeURIComponent(custSearch)}`).then((r) => r.json()).then((d) => setCustomers(d.customers || []))
    }
  }, [custSearch])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!therapistId || !serviceId) return
    setLoading(true)
    const res = await fetch('/api/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date,
        time,
        customerId,
        customerName: customerName || null,
        customerPhone: customerPhone || null,
        therapistId,
        serviceId,
        normalPrice,
        promotionId,
        promoLabel: selectedPromo?.name || (manualDiscount > 0 ? `ส่วนลด ${manualDiscount} ฿` : null),
        discount,
        actualAmount,
        commission,
        paymentMethod,
        isRequest,
        requestFee,
      }),
    })
    const data = await res.json()
    if (res.ok) {
      setLastSale(data.sale)
      setView('receipt')
      loadTodaySales()
      resetForm()
    }
    setLoading(false)
  }

  function resetForm() {
    setCustomerId(null)
    setCustomerName('')
    setCustomerPhone('')
    setTherapistId(null)
    setServiceId(null)
    setPromotionId(null)
    setManualDiscount(0)
    setPaymentMethod('QR Code')
    setIsRequest(false)
    setCustSearch('')
    const now = new Date()
    setTime(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`)
  }

  const todayTotal = todaySales.reduce((s, x) => s + x.actualAmount, 0)

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-800">🛒 บันทึกการขาย</h1>
        <div className="flex gap-2">
          <button onClick={() => setView('form')} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${view === 'form' ? 'bg-green-600 text-white' : 'bg-white border text-gray-600'}`}>+ บันทึกใหม่</button>
          <button onClick={() => { setView('history'); loadTodaySales() }} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${view === 'history' ? 'bg-green-600 text-white' : 'bg-white border text-gray-600'}`}>ประวัติวันนี้</button>
        </div>
      </div>

      {view === 'receipt' && lastSale && (
        <div className="bg-white rounded-xl shadow-lg border border-green-200 max-w-sm mx-auto p-6 mb-6">
          <div className="text-center mb-4">
            <div className="text-4xl mb-1">✅</div>
            <h2 className="font-bold text-gray-800">บันทึกเรียบร้อย!</h2>
            <p className="text-xs text-gray-400 mt-1">ใบเสร็จ {lastSale.receiptNo}</p>
          </div>
          <div className="border-t border-dashed pt-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">วันที่</span><span>{new Date(lastSale.date).toLocaleDateString('th-TH')}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">เวลา</span><span>{lastSale.time}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">ลูกค้า</span><span>{lastSale.customerName || '—'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">หมอนวด</span><span>{lastSale.therapist?.name}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">บริการ</span><span className="text-right max-w-36">{lastSale.service?.name}</span></div>
            {lastSale.promoLabel && <div className="flex justify-between"><span className="text-gray-500">โปรโมชั่น</span><span className="text-orange-600">{lastSale.promoLabel}</span></div>}
            {lastSale.discount > 0 && <div className="flex justify-between"><span className="text-gray-500">ส่วนลด</span><span className="text-red-500">-{lastSale.discount.toLocaleString('th-TH')} ฿</span></div>}
            {lastSale.isRequest && <div className="flex justify-between"><span className="text-gray-500">ค่ารีเควส</span><span className="text-blue-500">+{lastSale.requestFee} ฿</span></div>}
            <div className="flex justify-between font-bold text-base border-t pt-2"><span>ยอดรับจริง</span><span className="text-green-600">{formatBaht(lastSale.actualAmount + (lastSale.requestFee || 0))}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">ชำระด้วย</span><span>{lastSale.paymentMethod}</span></div>
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={() => setView('form')} className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-green-700">+ รายการถัดไป</button>
            <button onClick={() => window.print()} className="px-4 bg-gray-100 text-gray-600 py-2 rounded-lg text-sm">🖨️</button>
          </div>
        </div>
      )}

      {view === 'form' && (
        <form onSubmit={handleSubmit} className="grid md:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 space-y-4">
            <h3 className="font-semibold text-gray-700 text-sm">📋 รายละเอียด</h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">วันที่</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" required />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">เวลา</label>
                <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" required />
              </div>
            </div>

            {/* Customer Search */}
            <div className="relative">
              <label className="block text-xs text-gray-500 mb-1">ลูกค้า (พิมพ์เพื่อค้นหา)</label>
              <input
                type="text"
                value={custSearch || customerName}
                onChange={(e) => { setCustSearch(e.target.value); setCustomerName(e.target.value); setCustomerId(null) }}
                placeholder="ชื่อหรือเบอร์โทร..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              {filteredCustomers.length > 0 && (
                <div className="absolute z-10 left-0 right-0 bg-white border rounded-lg shadow-lg mt-1 max-h-40 overflow-y-auto">
                  {filteredCustomers.map((c) => (
                    <button key={c.id} type="button" onClick={() => { setCustomerId(c.id); setCustomerName(c.name); setCustomerPhone(c.phone || ''); setCustSearch('') }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-green-50">
                      {c.name} {c.phone ? `(${c.phone})` : ''}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">เบอร์โทร</label>
              <input type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="ไม่จำเป็น" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">หมอนวด *</label>
              <select value={therapistId || ''} onChange={(e) => setTherapistId(parseInt(e.target.value) || null)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" required>
                <option value="">-- เลือกหมอนวด --</option>
                {therapists.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">บริการ *</label>
              <select value={serviceId || ''} onChange={(e) => setServiceId(parseInt(e.target.value) || null)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" required>
                <option value="">-- เลือกบริการ --</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} — {s.price.toLocaleString('th-TH')} ฿</option>
                ))}
              </select>
            </div>
          </div>

          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 space-y-4">
            <h3 className="font-semibold text-gray-700 text-sm">💰 ราคา & การชำระ</h3>

            {selectedService && (
              <div className="bg-green-50 rounded-lg p-3 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">ราคาปกติ</span><span className="font-semibold">{normalPrice.toLocaleString('th-TH')} ฿</span></div>
                <div className="flex justify-between"><span className="text-gray-500">ค่ามือหมอ</span><span className="text-purple-600">{commission.toLocaleString('th-TH')} ฿</span></div>
              </div>
            )}

            <div>
              <label className="block text-xs text-gray-500 mb-1">โปรโมชั่น</label>
              <select value={promotionId || ''} onChange={(e) => { setPromotionId(parseInt(e.target.value) || null); setManualDiscount(0) }} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">-- ไม่มีโปรโมชั่น --</option>
                {promotions.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {!promotionId && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">ส่วนลด Manual (฿)</label>
                <input type="number" min="0" value={manualDiscount} onChange={(e) => setManualDiscount(parseInt(e.target.value) || 0)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
            )}

            <div>
              <label className="block text-xs text-gray-500 mb-1">ช่องทางชำระเงิน</label>
              <div className="grid grid-cols-2 gap-2">
                {PAYMENT_METHODS.map((m) => (
                  <button key={m} type="button" onClick={() => setPaymentMethod(m)}
                    className={`py-2 rounded-lg text-sm border transition-colors ${paymentMethod === m ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-300'}`}>
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input type="checkbox" id="request" checked={isRequest} onChange={(e) => setIsRequest(e.target.checked)} className="w-4 h-4 accent-green-600" />
              <label htmlFor="request" className="text-sm text-gray-600">รีเควสหมอ (+40 ฿)</label>
            </div>

            {selectedService && (
              <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                {discount > 0 && <div className="flex justify-between text-sm text-red-500"><span>ส่วนลด</span><span>-{discount.toLocaleString('th-TH')} ฿</span></div>}
                {isRequest && <div className="flex justify-between text-sm text-blue-500"><span>ค่ารีเควส</span><span>+{requestFee} ฿</span></div>}
                <div className="flex justify-between font-bold text-base border-t pt-2">
                  <span>ยอดรับจริง</span>
                  <span className="text-green-600">{formatBaht(actualAmount)}</span>
                </div>
              </div>
            )}

            <button type="submit" disabled={loading || !therapistId || !serviceId}
              className="w-full bg-green-600 text-white py-3 rounded-xl font-bold text-base hover:bg-green-700 disabled:opacity-50 transition-colors">
              {loading ? 'กำลังบันทึก...' : '✅ บันทึกการขาย'}
            </button>
          </div>
        </form>
      )}

      {view === 'history' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-4 border-b flex items-center justify-between">
            <h3 className="font-semibold text-gray-700">รายการวันนี้ — รวม {formatBaht(todayTotal)}</h3>
            <span className="text-sm text-gray-400">{todaySales.length} รายการ</span>
          </div>
          <div className="divide-y">
            {todaySales.length === 0 ? (
              <p className="p-6 text-center text-gray-400">ยังไม่มีรายการวันนี้</p>
            ) : todaySales.map((sale) => (
              <div key={sale.id} className="p-3 flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-800">{sale.service?.name}</p>
                  <p className="text-xs text-gray-500">{sale.therapist?.name} · {sale.customerName || 'ไม่ระบุ'} · {sale.time}</p>
                  {sale.promoLabel && <span className="text-xs text-orange-500">{sale.promoLabel}</span>}
                </div>
                <div className="text-right">
                  <p className="font-semibold text-green-600">{formatBaht(sale.actualAmount)}</p>
                  <p className="text-xs text-gray-400">{sale.paymentMethod}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Today Summary Bar */}
      {view === 'form' && todaySales.length > 0 && (
        <div className="fixed bottom-16 md:bottom-4 left-0 right-0 md:left-56 px-4 pointer-events-none">
          <div className="max-w-5xl mx-auto">
            <div className="bg-green-700 text-white rounded-xl px-4 py-2.5 flex justify-between items-center shadow-lg text-sm pointer-events-auto">
              <span>📊 วันนี้: {todaySales.length} รายการ</span>
              <span className="font-bold">{formatBaht(todayTotal)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
