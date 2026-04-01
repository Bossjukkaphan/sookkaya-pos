import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    await requireAuth()
    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q')
    const where: Record<string, unknown> = { active: true }
    if (q) where.OR = [{ name: { contains: q } }, { phone: { contains: q } }, { nickname: { contains: q } }]
    const customers = await prisma.customer.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { sales: true } },
        sales: { select: { actualAmount: true }, orderBy: { date: 'desc' }, take: 1 },
      },
    })
    return Response.json({ customers })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error'
    return Response.json({ error: msg }, { status: msg === 'Unauthorized' ? 401 : 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth()
    const body = await req.json()
    const customer = await prisma.customer.create({ data: body })
    return Response.json({ customer })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error'
    return Response.json({ error: msg }, { status: msg === 'Unauthorized' ? 401 : 500 })
  }
}
