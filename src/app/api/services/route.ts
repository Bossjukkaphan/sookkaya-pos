import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireOwner } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const all = searchParams.get('all') === 'true'
    const where = all ? {} : { active: true }
    const services = await prisma.service.findMany({ where, orderBy: { name: 'asc' } })
    return Response.json({ services })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error'
    return Response.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireOwner()
    const body = await req.json()
    const service = await prisma.service.create({ data: body })
    return Response.json({ service })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error'
    return Response.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : 500 })
  }
}
