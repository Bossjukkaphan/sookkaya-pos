import { NextRequest } from 'next/server'
import * as XLSX from 'xlsx'
import { prisma } from '@/lib/prisma'
import { requireOwner } from '@/lib/auth'
import { generateReceiptNo } from '@/lib/utils'

export async function POST(req: NextRequest) {
  try {
    await requireOwner()
    const formData = await req.formData()
    const file = formData.get('file') as File
    if (!file) return Response.json({ error: 'No file' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true })

    const results: Record<string, { imported: number; errors: string[] }> = {}

    // Import services from ตั้งค่า sheet
    const settingsSheet = wb.Sheets['ตั้งค่า']
    if (settingsSheet) {
      const rows = XLSX.utils.sheet_to_json<string[]>(settingsSheet, { header: 1, defval: null })
      let serviceCount = 0
      const serviceErrors: string[] = []
      for (let i = 10; i < rows.length; i++) {
        const row = rows[i] as unknown[]
        const name = row[2] as string
        const price = row[3] as number
        const commission = row[4] as number
        if (!name || typeof price !== 'number') continue
        const dur = extractDuration(String(name))
        try {
          await prisma.service.upsert({
            where: { id: 0 },
            update: {},
            create: { name: String(name), durationMin: dur, price: Math.round(price), commission: Math.round(commission || 0) },
          }).catch(() => {})
          await prisma.service.create({ data: { name: String(name), durationMin: dur, price: Math.round(price), commission: Math.round(commission || 0) } }).catch(() => {})
          serviceCount++
        } catch { serviceErrors.push(`Row ${i + 1}: ${name}`) }
      }
      results.services = { imported: serviceCount, errors: serviceErrors }
    }

    // Import therapists
    const therapistRows = settingsSheet
      ? (XLSX.utils.sheet_to_json<string[]>(settingsSheet, { header: 1, defval: null }) as unknown[][])
      : []
    let therapistCount = 0
    const therapistErrors: string[] = []
    for (let i = 3; i <= 10; i++) {
      const row = therapistRows[i] as unknown[]
      if (!row) continue
      const name = row[1] as string
      if (!name) continue
      const type = String(name).includes('freelance') ? 'freelance' : 'staff'
      try {
        await prisma.therapist.upsert({
          where: { name: String(name) },
          update: {},
          create: { name: String(name), type },
        })
        therapistCount++
      } catch { therapistErrors.push(String(name)) }
    }
    results.therapists = { imported: therapistCount, errors: therapistErrors }

    // Import customers from ข้อมูลลูกค้า sheet
    const crmSheet = wb.Sheets['ข้อมูลลูกค้า (CRM)']
    if (crmSheet) {
      const rows = XLSX.utils.sheet_to_json<unknown[]>(crmSheet, { header: 1, defval: null }) as unknown[][]
      let custCount = 0
      const custErrors: string[] = []
      for (let i = 3; i < rows.length; i++) {
        const row = rows[i]
        const name = row[1] as string
        if (!name) continue
        const phone = row[3] ? String(row[3]) : null
        const nickname = row[2] ? String(row[2]) : null
        const lineId = row[4] ? String(row[4]) : null
        try {
          await prisma.customer.create({ data: { name: String(name), phone, nickname, lineId } })
          custCount++
        } catch { custErrors.push(String(name)) }
      }
      results.customers = { imported: custCount, errors: custErrors }
    }

    // Import sales from บันทึกขาย sheet
    const salesSheet = wb.Sheets['บันทึกขาย']
    if (salesSheet) {
      const rows = XLSX.utils.sheet_to_json<unknown[]>(salesSheet, { header: 1, defval: null }) as unknown[][]
      let saleCount = 0
      const saleErrors: string[] = []

      const therapists = await prisma.therapist.findMany()
      const services = await prisma.service.findMany()
      const tMap = Object.fromEntries(therapists.map((t) => [t.name.toLowerCase(), t]))
      const sMap = Object.fromEntries(services.map((s) => [s.name.toLowerCase(), s]))

      for (let i = 2; i < rows.length; i++) {
        const row = rows[i]
        if (!row[0] || !(row[0] instanceof Date)) continue

        const date = row[0] as Date
        const receiptNo = row[2] ? String(row[2]) : generateReceiptNo()
        const customerName = row[3] ? String(row[3]) : null
        const customerPhone = row[4] ? String(row[4]) : null
        const therapistName = row[5] ? String(row[5]) : null
        const serviceName = row[6] ? String(row[6]) : null
        const normalPrice = typeof row[7] === 'number' ? row[7] : 0
        const promoLabel = row[8] ? String(row[8]) : null
        const discount = typeof row[9] === 'number' ? row[9] : 0
        const actualAmount = typeof row[10] === 'number' ? row[10] : normalPrice - discount
        const commission = typeof row[11] === 'number' ? row[11] : 0
        const paymentMethod = row[12] ? String(row[12]) : 'QR Code'
        const isRequest = row[13] === true || row[13] === 1 || row[13] === '✅'
        const requestFee = typeof row[14] === 'number' ? row[14] : 0

        if (!therapistName || !serviceName) continue

        const therapist = tMap[therapistName.toLowerCase()]
        const service = sMap[serviceName.toLowerCase()]
        if (!therapist || !service) continue

        const timeVal = row[1]
        let timeStr = '12:00'
        if (typeof timeVal === 'number') {
          const h = Math.floor(timeVal * 24)
          const m = Math.round((timeVal * 24 - h) * 60)
          timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
        } else if (typeof timeVal === 'string' && timeVal.includes(':')) {
          timeStr = timeVal
        }

        try {
          await prisma.sale.upsert({
            where: { receiptNo },
            update: {},
            create: {
              receiptNo,
              date,
              time: timeStr,
              customerName,
              customerPhone,
              therapistId: therapist.id,
              serviceId: service.id,
              normalPrice: Math.round(normalPrice),
              promoLabel,
              discount: Math.round(discount),
              actualAmount: Math.round(actualAmount),
              commission: Math.round(commission),
              paymentMethod,
              isRequest,
              requestFee: Math.round(requestFee),
            },
          })
          saleCount++
        } catch { saleErrors.push(`Row ${i + 1}`) }
      }
      results.sales = { imported: saleCount, errors: saleErrors }
    }

    // Import expenses from รายจ่าย sheet
    const expenseSheet = wb.Sheets['รายจ่าย']
    if (expenseSheet) {
      const rows = XLSX.utils.sheet_to_json<unknown[]>(expenseSheet, { header: 1, defval: null }) as unknown[][]
      let expCount = 0
      const expErrors: string[] = []
      for (let i = 2; i < rows.length; i++) {
        const row = rows[i]
        if (!row[0] || !(row[0] instanceof Date)) continue
        const date = row[0] as Date
        const description = row[1] ? String(row[1]) : ''
        const category = row[2] ? String(row[2]) : 'อื่นๆ'
        const amount = typeof row[3] === 'number' ? row[3] : 0
        const paidBy = row[4] ? String(row[4]) : null
        try {
          await prisma.expense.create({ data: { date, description, category, amount, paidBy } })
          expCount++
        } catch { expErrors.push(`Row ${i + 1}`) }
      }
      results.expenses = { imported: expCount, errors: expErrors }
    }

    return Response.json({ ok: true, results })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error'
    return Response.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : 500 })
  }
}

function extractDuration(name: string): number {
  const m = name.match(/(\d+)\s*นาที/)
  return m ? parseInt(m[1]) : 60
}
