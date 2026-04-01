import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    await requireAuth()
    const { searchParams } = new URL(req.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    if (!startDate || !endDate) return Response.json({ error: 'startDate and endDate required' }, { status: 400 })

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

        // Group by date
        const byDate: Record<string, { commission: number; sessions: number; requestFees: number }> = {}
        for (const s of sales) {
          const key = s.date.toISOString().split('T')[0]
          if (!byDate[key]) byDate[key] = { commission: 0, sessions: 0, requestFees: 0 }
          byDate[key].commission += s.commission
          byDate[key].sessions += 1
          byDate[key].requestFees += s.requestFee
        }

        let totalPay = 0
        let totalDays = 0
        let totalSessions = 0
        let totalCommission = 0
        let totalRequestFees = 0

        for (const day of Object.values(byDate)) {
          if (day.sessions === 0) continue
          totalDays++
          totalSessions += day.sessions
          totalCommission += day.commission
          totalRequestFees += day.requestFees
          totalPay += Math.max(day.commission, dailyMin) + day.requestFees
        }

        return {
          therapist: t,
          days: totalDays,
          sessions: totalSessions,
          commission: totalCommission,
          guarantee: totalDays * dailyMin,
          requestFees: totalRequestFees,
          netPay: totalPay,
        }
      })
    )

    return Response.json({ results })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error'
    return Response.json({ error: msg }, { status: msg === 'Unauthorized' ? 401 : 500 })
  }
}
