import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date')
  const status = searchParams.get('status')
  const source = searchParams.get('source')

  const where: Record<string, unknown> = {}
  if (date) {
    const d = new Date(date)
    const next = new Date(d)
    next.setDate(next.getDate() + 1)
    where.date = { gte: d, lt: next }
  }
  if (status) where.status = status
  if (source) where.source = source

  const bookings = await prisma.booking.findMany({
    where,
    include: { therapist: true, service: true, customer: true },
    orderBy: [{ date: 'asc' }, { time: 'asc' }],
  })
  return Response.json({ bookings })
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const body = await req.json()
    const booking = await prisma.booking.create({
      data: {
        date: new Date(body.date),
        time: body.time,
        customerId: body.customerId || null,
        customerName: body.customerName,
        customerPhone: body.customerPhone || null,
        therapistId: body.therapistId || null,
        serviceId: body.serviceId,
        notes: body.notes || null,
        status: body.status || 'pending',
        source: body.source || (session ? 'walkin' : 'online'),
        createdById: session?.id || null,
      },
      include: { therapist: true, service: true, customer: true },
    })
    return Response.json({ booking })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error'
    return Response.json({ error: msg }, { status: 500 })
  }
}
