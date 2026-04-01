import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    await requireAuth()
    const { searchParams } = new URL(req.url)
    const month = searchParams.get('month')
    const year = searchParams.get('year')

    const where: Record<string, unknown> = {}
    if (month && year) {
      const start = new Date(parseInt(year), parseInt(month) - 1, 1)
      const end = new Date(parseInt(year), parseInt(month), 1)
      where.date = { gte: start, lt: end }
    } else if (year) {
      const start = new Date(parseInt(year), 0, 1)
      const end = new Date(parseInt(year) + 1, 0, 1)
      where.date = { gte: start, lt: end }
    }

    const expenses = await prisma.expense.findMany({ where, orderBy: { date: 'desc' } })
    return Response.json({ expenses })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error'
    return Response.json({ error: msg }, { status: msg === 'Unauthorized' ? 401 : 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth()
    const body = await req.json()
    const expense = await prisma.expense.create({
      data: { ...body, date: new Date(body.date) },
    })
    return Response.json({ expense })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error'
    return Response.json({ error: msg }, { status: msg === 'Unauthorized' ? 401 : 500 })
  }
}
