import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    await requireAuth()
    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type') || 'monthly'
    const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString())
    const month = searchParams.get('month') ? parseInt(searchParams.get('month')!) : null

    if (type === 'daily' && month) {
      const start = new Date(year, month - 1, 1)
      const end = new Date(year, month, 1)
      const [sales, expenses] = await Promise.all([
        prisma.sale.findMany({ where: { date: { gte: start, lt: end } }, select: { date: true, actualAmount: true, discount: true, commission: true } }),
        prisma.expense.findMany({ where: { date: { gte: start, lt: end } }, select: { date: true, amount: true, category: true } }),
      ])
      const byDay: Record<string, { revenue: number; discount: number; commission: number; expense: number; sessions: number }> = {}
      for (const s of sales) {
        const key = s.date.toISOString().split('T')[0]
        if (!byDay[key]) byDay[key] = { revenue: 0, discount: 0, commission: 0, expense: 0, sessions: 0 }
        byDay[key].revenue += s.actualAmount
        byDay[key].discount += s.discount
        byDay[key].commission += s.commission
        byDay[key].sessions += 1
      }
      for (const e of expenses) {
        const key = e.date.toISOString().split('T')[0]
        if (!byDay[key]) byDay[key] = { revenue: 0, discount: 0, commission: 0, expense: 0, sessions: 0 }
        byDay[key].expense += e.amount
      }
      return Response.json({ type, year, month, data: byDay })
    }

    if (type === 'monthly') {
      const start = new Date(year, 0, 1)
      const end = new Date(year + 1, 0, 1)
      const [sales, expenses] = await Promise.all([
        prisma.sale.findMany({ where: { date: { gte: start, lt: end } }, select: { date: true, actualAmount: true, discount: true, commission: true } }),
        prisma.expense.findMany({ where: { date: { gte: start, lt: end } }, select: { date: true, amount: true } }),
      ])
      const byMonth: Record<number, { revenue: number; expense: number; commission: number; sessions: number }> = {}
      for (let i = 1; i <= 12; i++) byMonth[i] = { revenue: 0, expense: 0, commission: 0, sessions: 0 }
      for (const s of sales) {
        const m = s.date.getMonth() + 1
        byMonth[m].revenue += s.actualAmount
        byMonth[m].commission += s.commission
        byMonth[m].sessions += 1
      }
      for (const e of expenses) {
        const m = e.date.getMonth() + 1
        byMonth[m].expense += e.amount
      }
      return Response.json({ type, year, data: byMonth })
    }

    if (type === 'therapist' && month) {
      const start = new Date(year, month - 1, 1)
      const end = new Date(year, month, 1)
      const sales = await prisma.sale.groupBy({
        by: ['therapistId'],
        where: { date: { gte: start, lt: end } },
        _sum: { actualAmount: true, commission: true },
        _count: { id: true },
      })
      const therapists = await prisma.therapist.findMany()
      const tMap = Object.fromEntries(therapists.map((t) => [t.id, t]))
      const data = sales.map((s) => ({
        therapist: tMap[s.therapistId],
        sessions: s._count.id,
        revenue: s._sum.actualAmount || 0,
        commission: s._sum.commission || 0,
      }))
      return Response.json({ type, year, month, data })
    }

    if (type === 'service' && month) {
      const start = new Date(year, month - 1, 1)
      const end = new Date(year, month, 1)
      const sales = await prisma.sale.groupBy({
        by: ['serviceId'],
        where: { date: { gte: start, lt: end } },
        _sum: { actualAmount: true },
        _count: { id: true },
      })
      const services = await prisma.service.findMany()
      const sMap = Object.fromEntries(services.map((s) => [s.id, s]))
      const data = sales.map((s) => ({
        service: sMap[s.serviceId],
        sessions: s._count.id,
        revenue: s._sum.actualAmount || 0,
      }))
      return Response.json({ type, year, month, data })
    }

    return Response.json({ error: 'Invalid type' }, { status: 400 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error'
    return Response.json({ error: msg }, { status: msg === 'Unauthorized' ? 401 : 500 })
  }
}
