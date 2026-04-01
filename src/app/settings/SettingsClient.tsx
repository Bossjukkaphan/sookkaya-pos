'use client'
import { useEffect, useState } from 'react'

interface Service { id: number; name: string; price: number; commission: number; durationMin: number; active: boolean }
interface Therapist { id: number; name: string; type: string; dailyMinimum: number; active: boolean }
interface Promotion { id: number; name: string; type: string; value: number; description?: string; active: boolean }
interface User { id: number; username: string; name: string; role: string; active: boolean }

type Tab = 'services' | 'therapists' | 'promotions' | 'users' | 'import' | 'general'

export default function SettingsClient({ role }: { role: string }) {
  const [tab, setTab] = useState<Tab>('services')
  const [services, setServices] = useState<Service[]>([])
  const [therapists, setTherapists] = useState<Therapist[]>([])
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importResult, setImportResult] = useState<string | null>(null)

  // Generic forms
  const [serviceForm, setServiceForm] = useState({ name: '', durationMin: '60', price: '', commission: '' })
  const [therapistForm, setTherapistForm] = useState({ name: '', type: 'staff', dailyMinimum: '500' })
  const [promoForm, setPromoForm] = useState({ name: '', type: 'fixed', value: '', description: '' })
  const [userForm, setUserForm] = useState({ username: '', password: '', name: '', role: 'staff' })

  useEffect(() => { loadData() }, [tab])

  async function loadData() {
    if (tab === 'services') { const r = await fetch('/api/services?all=true'); const d = await r.json(); setServices(d.services || []) }
    if (tab === 'therapists') { const r = await fetch('/api/therapists?all=true'); const d = await r.json(); setTherapists(d.therapists || []) }
    if (tab === 'promotions') { const r = await fetch('/api/promotions'); const d = await r.json(); setPromotions(d.promotions || []) }
    if (tab === 'users') { const r = await fetch('/api/users'); const d = await r.json(); setUsers(d.users || []) }
    if (tab === 'general') { const r = await fetch('/api/settings'); const d = await r.json(); setSettings(d.settings || {}) }
  }

  async function handleImport() {
    if (!importFile) return
    setLoading(true)
    const fd = new FormData()
    fd.append('file', importFile)
    const res = await fetch('/api/import', { method: 'POST', body: fd })
    const data = await res.json()
    if (res.ok) {
      const lines = Object.entries(data.results as Record<string, { imported: number; errors: string[] }>).map(([k, v]) => `${k}: นำเข้า ${v.imported} รายการ`)
      setImportResult('✅ นำเข้าสำเร็จ!\n' + lines.join('\n'))
    } else {
      setImportResult('❌ เกิดข้อผิดพลาด: ' + data.error)
    }
    setLoading(false)
  }

  async function createService(e: React.FormEvent) {
    e.preventDefault()
    await fetch('/api/services', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...serviceForm, durationMin: parseInt(serviceForm.durationMin), price: parseInt(serviceForm.price), commission: parseInt(serviceForm.commission) }) })
    setShowForm(false); setServiceForm({ name: '', durationMin: '60', price: '', commission: '' }); loadData()
  }

  async function createTherapist(e: React.FormEvent) {
    e.preventDefault()
    await fetch('/api/therapists', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...therapistForm, dailyMinimum: parseInt(therapistForm.dailyMinimum) }) })
    setShowForm(false); setTherapistForm({ name: '', type: 'staff', dailyMinimum: '500' }); loadData()
  }

  async function createPromo(e: React.FormEvent) {
    e.preventDefault()
    await fetch('/api/promotions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...promoForm, value: parseFloat(promoForm.value) }) })
    setShowForm(false); setPromoForm({ name: '', type: 'fixed', value: '', description: '' }); loadData()
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault()
    await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(userForm) })
    setShowForm(false); setUserForm({ username: '', password: '', name: '', role: 'staff' }); loadData()
  }

  async function toggleService(id: number, active: boolean) {
    await fetch(`/api/services/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active }) })
    loadData()
  }

  async function togglePromo(id: number, active: boolean) {
    await fetch(`/api/promotions/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active }) })
    loadData()
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault()
    await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) })
    alert('บันทึกแล้ว!')
  }

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'services', label: 'บริการ', icon: '💆' },
    { key: 'therapists', label: 'หมอนวด', icon: '👩‍⚕️' },
    { key: 'promotions', label: 'โปรโมชั่น', icon: '🎁' },
    ...(role === 'owner' ? [{ key: 'users' as Tab, label: 'ผู้ใช้', icon: '👥' }, { key: 'import' as Tab, label: 'Import', icon: '📥' }, { key: 'general' as Tab, label: 'ทั่วไป', icon: '⚙️' }] : []),
  ]

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 max-w-4xl mx-auto">
      <h1 className="text-xl font-bold text-gray-800 mb-4">⚙️ ตั้งค่า</h1>

      <div className="flex gap-2 mb-4 overflow-x-auto pb-1 scrollbar-hide">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => { setTab(t.key); setShowForm(false) }}
            className={`px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${tab === t.key ? 'bg-green-600 text-white' : 'bg-white border text-gray-600'}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Services Tab */}
      {tab === 'services' && (
        <div>
          <div className="flex justify-end mb-3">
            <button onClick={() => setShowForm(!showForm)} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium">+ เพิ่มบริการ</button>
          </div>
          {showForm && (
            <form onSubmit={createService} className="bg-white rounded-xl p-4 shadow-sm border mb-4 grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-gray-500">ชื่อบริการ *</label>
                <input value={serviceForm.name} onChange={(e) => setServiceForm({...serviceForm, name: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" required />
              </div>
              <div>
                <label className="text-xs text-gray-500">ระยะเวลา (นาที)</label>
                <input type="number" value={serviceForm.durationMin} onChange={(e) => setServiceForm({...serviceForm, durationMin: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" />
              </div>
              <div>
                <label className="text-xs text-gray-500">ราคา (฿) *</label>
                <input type="number" value={serviceForm.price} onChange={(e) => setServiceForm({...serviceForm, price: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" required />
              </div>
              <div>
                <label className="text-xs text-gray-500">ค่ามือหมอ (฿) *</label>
                <input type="number" value={serviceForm.commission} onChange={(e) => setServiceForm({...serviceForm, commission: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" required />
              </div>
              <div className="flex gap-2 col-span-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 border text-gray-600 py-2 rounded-lg text-sm">ยกเลิก</button>
                <button type="submit" className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm font-medium">บันทึก</button>
              </div>
            </form>
          )}
          <div className="space-y-2">
            {services.map((s) => (
              <div key={s.id} className="bg-white rounded-xl p-3 shadow-sm border flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm text-gray-800">{s.name}</p>
                  <p className="text-xs text-gray-500">ราคา {s.price.toLocaleString('th-TH')} ฿ · ค่ามือ {s.commission.toLocaleString('th-TH')} ฿ · {s.durationMin} นาที</p>
                </div>
                <button onClick={() => toggleService(s.id, !s.active)} className={`text-xs px-2 py-1 rounded-full ${s.active ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                  {s.active ? '✅' : '⛔'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Therapists Tab */}
      {tab === 'therapists' && (
        <div>
          <div className="flex justify-end mb-3">
            <button onClick={() => setShowForm(!showForm)} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium">+ เพิ่มหมอนวด</button>
          </div>
          {showForm && (
            <form onSubmit={createTherapist} className="bg-white rounded-xl p-4 shadow-sm border mb-4 space-y-3">
              <div>
                <label className="text-xs text-gray-500">ชื่อหมอนวด *</label>
                <input value={therapistForm.name} onChange={(e) => setTherapistForm({...therapistForm, name: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500">ประเภท</label>
                  <select value={therapistForm.type} onChange={(e) => setTherapistForm({...therapistForm, type: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm mt-1">
                    <option value="staff">Staff</option>
                    <option value="freelance">Freelance</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500">ประกันมือ (฿/วัน)</label>
                  <input type="number" value={therapistForm.dailyMinimum} onChange={(e) => setTherapistForm({...therapistForm, dailyMinimum: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" />
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 border text-gray-600 py-2 rounded-lg text-sm">ยกเลิก</button>
                <button type="submit" className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm font-medium">บันทึก</button>
              </div>
            </form>
          )}
          <div className="space-y-2">
            {therapists.map((t) => (
              <div key={t.id} className="bg-white rounded-xl p-3 shadow-sm border flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{t.name} <span className="text-xs text-gray-400">{t.type === 'freelance' ? '(Freelance)' : ''}</span></p>
                  <p className="text-xs text-gray-500">ประกันมือ {t.dailyMinimum.toLocaleString('th-TH')} ฿/วัน</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${t.active ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>{t.active ? 'Active' : 'Inactive'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Promotions Tab */}
      {tab === 'promotions' && (
        <div>
          <div className="flex justify-end mb-3">
            <button onClick={() => setShowForm(!showForm)} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium">+ เพิ่มโปรโมชั่น</button>
          </div>
          {showForm && (
            <form onSubmit={createPromo} className="bg-white rounded-xl p-4 shadow-sm border mb-4 space-y-3">
              <div>
                <label className="text-xs text-gray-500">ชื่อโปรโมชั่น *</label>
                <input value={promoForm.name} onChange={(e) => setPromoForm({...promoForm, name: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500">ประเภท</label>
                  <select value={promoForm.type} onChange={(e) => setPromoForm({...promoForm, type: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm mt-1">
                    <option value="fixed">ลด (฿)</option>
                    <option value="percent">ลด (%)</option>
                    <option value="free_session">ฟรี (100%)</option>
                    <option value="custom">กำหนดเอง</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500">ค่า {promoForm.type === 'percent' ? '(%)' : '(฿)'}</label>
                  <input type="number" value={promoForm.value} onChange={(e) => setPromoForm({...promoForm, value: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500">รายละเอียด</label>
                <input value={promoForm.description} onChange={(e) => setPromoForm({...promoForm, description: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 border text-gray-600 py-2 rounded-lg text-sm">ยกเลิก</button>
                <button type="submit" className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm font-medium">บันทึก</button>
              </div>
            </form>
          )}
          <div className="space-y-2">
            {promotions.map((p) => (
              <div key={p.id} className="bg-white rounded-xl p-3 shadow-sm border flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{p.name}</p>
                  <p className="text-xs text-gray-500">{p.type === 'percent' ? `${p.value}%` : p.type === 'free_session' ? 'ฟรี' : `${p.value} ฿`} {p.description && `· ${p.description}`}</p>
                </div>
                <button onClick={() => togglePromo(p.id, !p.active)} className={`text-xs px-2 py-1 rounded-full ${p.active ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                  {p.active ? '✅ Active' : '⛔'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Users Tab */}
      {tab === 'users' && role === 'owner' && (
        <div>
          <div className="flex justify-end mb-3">
            <button onClick={() => setShowForm(!showForm)} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium">+ เพิ่มผู้ใช้</button>
          </div>
          {showForm && (
            <form onSubmit={createUser} className="bg-white rounded-xl p-4 shadow-sm border mb-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500">ชื่อผู้ใช้ *</label>
                  <input value={userForm.username} onChange={(e) => setUserForm({...userForm, username: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" required />
                </div>
                <div>
                  <label className="text-xs text-gray-500">รหัสผ่าน *</label>
                  <input type="password" value={userForm.password} onChange={(e) => setUserForm({...userForm, password: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500">ชื่อ</label>
                  <input value={userForm.name} onChange={(e) => setUserForm({...userForm, name: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">บทบาท</label>
                  <select value={userForm.role} onChange={(e) => setUserForm({...userForm, role: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm mt-1">
                    <option value="staff">พนักงาน</option>
                    <option value="owner">เจ้าของ</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 border text-gray-600 py-2 rounded-lg text-sm">ยกเลิก</button>
                <button type="submit" className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm font-medium">บันทึก</button>
              </div>
            </form>
          )}
          <div className="space-y-2">
            {users.map((u) => (
              <div key={u.id} className="bg-white rounded-xl p-3 shadow-sm border flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{u.name} <span className="text-xs text-gray-400">@{u.username}</span></p>
                  <p className="text-xs text-gray-500">{u.role === 'owner' ? '🔑 เจ้าของ' : '👤 พนักงาน'}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${u.active ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'}`}>{u.active ? 'Active' : 'Inactive'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Import Tab */}
      {tab === 'import' && role === 'owner' && (
        <div className="bg-white rounded-xl p-6 shadow-sm border">
          <h3 className="font-semibold text-gray-800 mb-2">📥 นำเข้าข้อมูลจาก Excel</h3>
          <p className="text-sm text-gray-500 mb-4">รองรับไฟล์ Excel จากระบบเดิม (.xlsx) — จะนำเข้า: บริการ, หมอนวด, ลูกค้า, บันทึกขาย, รายจ่าย</p>
          <input type="file" accept=".xlsx,.xls" onChange={(e) => setImportFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-gray-500 mb-4 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-green-50 file:text-green-700 hover:file:bg-green-100" />
          <button onClick={handleImport} disabled={!importFile || loading}
            className="w-full bg-green-600 text-white py-2.5 rounded-xl font-medium disabled:opacity-50 hover:bg-green-700">
            {loading ? '⏳ กำลังนำเข้า...' : '📥 เริ่มนำเข้าข้อมูล'}
          </button>
          {importResult && (
            <div className="mt-4 bg-green-50 border border-green-200 rounded-xl p-4">
              <pre className="text-sm text-green-800 whitespace-pre-wrap">{importResult}</pre>
            </div>
          )}
        </div>
      )}

      {/* General Settings */}
      {tab === 'general' && role === 'owner' && (
        <form onSubmit={saveSettings} className="bg-white rounded-xl p-6 shadow-sm border space-y-4">
          <h3 className="font-semibold text-gray-800">⚙️ การตั้งค่าระบบ</h3>
          <div>
            <label className="text-sm font-medium text-gray-700">ประกันมือขั้นต่ำ (฿/วัน)</label>
            <input type="number" value={settings.dailyMinimum || '500'} onChange={(e) => setSettings({...settings, dailyMinimum: e.target.value})}
              className="w-full border rounded-lg px-3 py-2 text-sm mt-1 max-w-xs" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">ค่ารีเควส (฿/ครั้ง)</label>
            <input type="number" value={settings.requestFee || '40'} onChange={(e) => setSettings({...settings, requestFee: e.target.value})}
              className="w-full border rounded-lg px-3 py-2 text-sm mt-1 max-w-xs" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">ชื่อร้าน</label>
            <input value={settings.shopName || 'SOOKKAYA Thai Massage'} onChange={(e) => setSettings({...settings, shopName: e.target.value})}
              className="w-full border rounded-lg px-3 py-2 text-sm mt-1 max-w-xs" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Link จองออนไลน์ (แชร์ให้ลูกค้า)</label>
            <div className="flex gap-2 items-center mt-1">
              <input readOnly value={typeof window !== 'undefined' ? `${window.location.origin}/book` : '/book'} className="flex-1 border rounded-lg px-3 py-2 text-sm bg-gray-50" />
              <button type="button" onClick={() => navigator.clipboard.writeText(`${window.location.origin}/book`)} className="text-sm bg-blue-50 text-blue-600 px-3 py-2 rounded-lg hover:bg-blue-100">คัดลอก</button>
            </div>
          </div>
          <button type="submit" className="bg-green-600 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-green-700">💾 บันทึกการตั้งค่า</button>
        </form>
      )}
    </div>
  )
}
