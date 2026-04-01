import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireOwner } from '@/lib/auth'

export async function GET() {
  try {
    await requireAuth()
    const promotions = await prisma.promotion.findMany({ where: { active: true }, orderBy: { name: 'asc' } })
    return Response.json({ promotions })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error'
    return Response.json({ error: msg }, { status: 401 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireOwner()
    const body = await req.json()
    const promo = await prisma.promotion.create({ data: body })
    return Response.json({ promo })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error'
    return Response.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : 500 })
  }
}
