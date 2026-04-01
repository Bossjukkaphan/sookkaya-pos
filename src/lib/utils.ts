export function generateReceiptNo(): string {
  const r = () => Math.floor(Math.random() * 100000).toString().padStart(5, '0')
  return `#${r()}-${r()}`
}

export function thaiDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Bangkok',
  })
}

export function thaiTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Bangkok',
  })
}

export function formatBaht(amount: number): string {
  return amount.toLocaleString('th-TH') + ' ฿'
}

export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ')
}

export const PAYMENT_METHODS = ['QR Code', 'เงินสด', 'บัตรเครดิต', 'โอนเงิน']

export const EXPENSE_CATEGORIES = [
  'HR / payroll (เงินประกัน ค่ามือ เงินเดือน)',
  'ซักรีด',
  'ชุดลูกค้า ชุดหมอ ชุดพนักงาน',
  'ค่าเช่าสถานที่',
  'ค่าน้ำ / ค่าไฟ / Internet',
  'วัสดุ-สิ้นเปลือง (น้ำมัน บาล์ม ฯลฯ)',
  'การตลาด / โฆษณา',
  'อื่นๆ',
]

export const BOOKING_STATUSES = {
  pending: { label: 'รอยืนยัน', color: 'bg-yellow-100 text-yellow-800' },
  confirmed: { label: 'ยืนยันแล้ว', color: 'bg-blue-100 text-blue-800' },
  completed: { label: 'เสร็จแล้ว', color: 'bg-green-100 text-green-800' },
  cancelled: { label: 'ยกเลิก', color: 'bg-red-100 text-red-800' },
}
