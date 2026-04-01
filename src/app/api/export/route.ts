import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import * as XLSX from 'xlsx'

export async function GET(req: NextRequest) {
  try {
    await requireAuth()
    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type')
    const month = searchParams.get('month')
    const year = searchParams.get('year')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    let wb: XLSX.WorkBook

    switch (type) {
      case 'sales':
        wb = await exportSales(month, year)
        break
      case 'therapist-pay':
        wb = await exportTherapistPay(startDate, endDate)
        break
      case 'expenses':
        wb = await exportExpenses(month, year)
        break
      case 'customers':
        wb = await exportCustomers()
        break
      default:
        return Response.json({ error: 'Invalid type' }, { status: 400 })
    }

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    const filename = `sookkaya_${type}_${new Date().toISOString().split('T')[0]}.xlsx`

    return new Response(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error'
    return Response.json({ error: msg }, { status: msg === 'Unauthorized' ? 401 : 500 })
  }
}

function dateFilter(month: string | null, year: string | null) {
  const where: Record<string, unknown> = {}
  if (month && year) {
    where.date = { gte: new Date(parseInt(year), parseInt(month) - 1, 1), lt: new Date(parseInt(year), parseInt(month), 1) }
  } else if (year) {
    where.date = { gte: new Date(parseInt(year), 0, 1), lt: new Date(parseInt(year) + 1, 0, 1) }
  }
  return where
}

function formatDate(d: Date) {
  return d.toLocaleDateString('th-TH', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

async function exportSales(month: string | null, year: string | null) {
  const where = dateFilter(month, year)
  const sales = await prisma.sale.findMany({
    where,
    include: { therapist: true, service: true, customer: true, promotion: true },
    orderBy: { date: 'asc' },
  })

  const rows = sales.map((s) => ({
    'เลขที่ใบเสร็จ': s.receiptNo,
    'วันที่': formatDate(s.date),
    'เวลา': s.time,
    'ลูกค้า': s.customer?.name || s.customerName || '-',
    'เบอร์โทร': s.customer?.phone || s.customerPhone || '-',
    'หมอนวด': s.therapist.name,
    'บริการ': s.service.name,
    'ระยะเวลา (นาที)': s.service.durationMin,
    'ราคาปกติ': s.normalPrice,
    'โปรโมชั่น': s.promoLabel || '-',
    'ส่วนลด': s.discount,
    'ยอดชำระ': s.actualAmount,
    'ค่ามือ': s.commission,
    'วิธีชำระ': s.paymentMethod,
    'รีเควส': s.isRequest ? 'ใช่' : '-',
    'ค่ารีเควส': s.requestFee,
  }))

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows)

  // Set column widths
  ws['!cols'] = [
    { wch: 18 }, { wch: 14 }, { wch: 8 }, { wch: 20 }, { wch: 14 },
    { wch: 16 }, { wch: 25 }, { wch: 14 }, { wch: 10 }, { wch: 18 },
    { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 8 }, { wch: 10 },
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'ยอดขาย')

  // Summary sheet
  const totalRevenue = sales.reduce((s, r) => s + r.actualAmount, 0)
  const totalCommission = sales.reduce((s, r) => s + r.commission, 0)
  const totalDiscount = sales.reduce((s, r) => s + r.discount, 0)
  const totalRequestFee = sales.reduce((s, r) => s + r.requestFee, 0)

  const summary = [
    { 'รายการ': 'จำนวน Session', 'จำนวน': sales.length },
    { 'รายการ': 'รายรับรวม', 'จำนวน': totalRevenue },
    { 'รายการ': 'ส่วนลดรวม', 'จำนวน': totalDiscount },
    { 'รายการ': 'ค่ามือรวม', 'จำนวน': totalCommission },
    { 'รายการ': 'ค่ารีเควสรวม', 'จำนวน': totalRequestFee },
  ]
  const wsSummary = XLSX.utils.json_to_sheet(summary)
  wsSummary['!cols'] = [{ wch: 20 }, { wch: 15 }]
  XLSX.utils.book_append_sheet(wb, wsSummary, 'สรุป')

  return wb
}

async function exportTherapistPay(startDate: string | null, endDate: string | null) {
  if (!startDate || !endDate) throw new Error('startDate and endDate required')

  const start = new Date(startDate)
  const end = new Date(endDate)
  end.setDate(end.getDate() + 1)

  const therapists = await prisma.therapist.findMany({ where: { active: true } })
  const setting = await prisma.setting.findUnique({ where: { key: 'dailyMinimum' } })
  const dailyMin = setting ? parseInt(setting.value) : 500

  const results = await Promise.all(
    therapists.map(async (t) => {
      const sales = await prisma.sale.findMany({
        where: { therapistId: t.id, date: { gte: start, lt: end } },
        select: { date: true, commission: true, isRequest: true, requestFee: true },
      })

      const byDate: Record<string, { commission: number; sessions: number; requestFees: number }> = {}
      for (const s of sales) {
        const key = s.date.toISOString().split('T')[0]
        if (!byDate[key]) byDate[key] = { commission: 0, sessions: 0, requestFees: 0 }
        byDate[key].commission += s.commission
        byDate[key].sessions += 1
        byDate[key].requestFees += s.requestFee
      }

      let totalPay = 0, totalDays = 0, totalSessions = 0, totalCommission = 0, totalRequestFees = 0
      for (const day of Object.values(byDate)) {
        if (day.sessions === 0) continue
        totalDays++
        totalSessions += day.sessions
        totalCommission += day.commission
        totalRequestFees += day.requestFees
        totalPay += Math.max(day.commission, dailyMin) + day.requestFees
      }

      return { therapist: t, days: totalDays, sessions: totalSessions, commission: totalCommission, guarantee: totalDays * dailyMin, requestFees: totalRequestFees, netPay: totalPay }
    })
  )

  // Summary sheet
  const summaryRows = results.filter(r => r.days > 0).map((r) => ({
    'หมอนวด': r.therapist.name,
    'ประเภท': r.therapist.type === 'freelance' ? 'Freelance' : 'ประจำ',
    'จำนวนวัน': r.days,
    'จำนวน Session': r.sessions,
    'ค่ามือจริง': r.commission,
    'ประกันขั้นต่ำ': r.guarantee,
    'ค่ารีเควส': r.requestFees,
    'ยอดจ่ายสุทธิ': r.netPay,
  }))

  // Add total row
  const totalNetPay = results.reduce((s, r) => s + r.netPay, 0)
  summaryRows.push({
    'หมอนวด': 'รวมทั้งหมด',
    'ประเภท': '',
    'จำนวนวัน': results.reduce((s, r) => s + r.days, 0),
    'จำนวน Session': results.reduce((s, r) => s + r.sessions, 0),
    'ค่ามือจริง': results.reduce((s, r) => s + r.commission, 0),
    'ประกันขั้นต่ำ': results.reduce((s, r) => s + r.guarantee, 0),
    'ค่ารีเควส': results.reduce((s, r) => s + r.requestFees, 0),
    'ยอดจ่ายสุทธิ': totalNetPay,
  })

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(summaryRows)
  ws['!cols'] = [{ wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, ws, 'ค่ามือ')

  // Detail sheet - daily breakdown per therapist
  const detailRows: Record<string, unknown>[] = []
  for (const r of results.filter(r => r.days > 0)) {
    const sales = await prisma.sale.findMany({
      where: { therapistId: r.therapist.id, date: { gte: start, lt: end } },
      include: { service: true, customer: true },
      orderBy: { date: 'asc' },
    })
    for (const s of sales) {
      detailRows.push({
        'หมอนวด': r.therapist.name,
        'วันที่': formatDate(s.date),
        'เวลา': s.time,
        'ลูกค้า': s.customer?.name || s.customerName || '-',
        'บริการ': s.service.name,
        'ยอดชำระ': s.actualAmount,
        'ค่ามือ': s.commission,
        'รีเควส': s.isRequest ? 'ใช่' : '-',
        'ค่ารีเควส': s.requestFee,
      })
    }
  }

  if (detailRows.length > 0) {
    const wsDetail = XLSX.utils.json_to_sheet(detailRows)
    wsDetail['!cols'] = [{ wch: 16 }, { wch: 14 }, { wch: 8 }, { wch: 20 }, { wch: 25 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 10 }]
    XLSX.utils.book_append_sheet(wb, wsDetail, 'รายละเอียด')
  }

  return wb
}

async function exportExpenses(month: string | null, year: string | null) {
  const where = dateFilter(month, year)
  const expenses = await prisma.expense.findMany({ where, orderBy: { date: 'asc' } })

  const rows = expenses.map((e) => ({
    'วันที่': formatDate(e.date),
    'รายการ': e.description,
    'หมวดหมู่': e.category,
    'จำนวน (฿)': e.amount,
    'จ่ายโดย': e.paidBy || '-',
    'หมายเหตุ': e.notes || '-',
  }))

  // Add total row
  const total = expenses.reduce((s, e) => s + e.amount, 0)
  rows.push({
    'วันที่': '',
    'รายการ': 'รวมทั้งหมด',
    'หมวดหมู่': '',
    'จำนวน (฿)': total,
    'จ่ายโดย': '',
    'หมายเหตุ': '',
  })

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [{ wch: 14 }, { wch: 30 }, { wch: 18 }, { wch: 12 }, { wch: 14 }, { wch: 20 }]
  XLSX.utils.book_append_sheet(wb, ws, 'รายจ่าย')

  // Category summary sheet
  const byCategory: Record<string, number> = {}
  for (const e of expenses) byCategory[e.category] = (byCategory[e.category] || 0) + e.amount
  const catRows = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => ({
    'หมวดหมู่': cat,
    'จำนวน (฿)': amt,
  }))
  catRows.push({ 'หมวดหมู่': 'รวม', 'จำนวน (฿)': total })

  const wsCat = XLSX.utils.json_to_sheet(catRows)
  wsCat['!cols'] = [{ wch: 20 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, wsCat, 'สรุปตามหมวดหมู่')

  return wb
}

async function exportCustomers() {
  const customers = await prisma.customer.findMany({
    where: { active: true },
    include: {
      _count: { select: { sales: true } },
      sales: {
        select: { date: true, actualAmount: true, service: { select: { name: true } }, therapist: { select: { name: true } } },
        orderBy: { date: 'desc' },
      },
    },
    orderBy: { name: 'asc' },
  })

  // Customer list sheet
  const rows = customers.map((c) => {
    const totalSpent = c.sales.reduce((s, sale) => s + sale.actualAmount, 0)
    const lastVisit = c.sales[0] ? formatDate(c.sales[0].date) : '-'
    return {
      'ชื่อ': c.name,
      'ชื่อเล่น': c.nickname || '-',
      'เบอร์โทร': c.phone || '-',
      'Line ID': c.lineId || '-',
      'วันเกิด': c.birthday || '-',
      'หมายเหตุ': c.notes || '-',
      'จำนวนครั้ง': c._count.sales,
      'ยอดใช้จ่ายรวม': totalSpent,
      'มาล่าสุด': lastVisit,
    }
  })

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 20 }, { wch: 12 }, { wch: 14 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, ws, 'ลูกค้า')

  // Visit history sheet (top customers)
  const historyRows: Record<string, unknown>[] = []
  for (const c of customers) {
    for (const s of c.sales) {
      historyRows.push({
        'ลูกค้า': c.name,
        'เบอร์โทร': c.phone || '-',
        'วันที่': formatDate(s.date),
        'บริการ': s.service.name,
        'หมอนวด': s.therapist.name,
        'ยอดชำระ': s.actualAmount,
      })
    }
  }

  if (historyRows.length > 0) {
    const wsHistory = XLSX.utils.json_to_sheet(historyRows)
    wsHistory['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 25 }, { wch: 16 }, { wch: 12 }]
    XLSX.utils.book_append_sheet(wb, wsHistory, 'ประวัติการใช้บริการ')
  }

  return wb
}
