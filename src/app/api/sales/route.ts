import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { generateReceiptNo } from '@/lib/utils'

export async function GET(req: NextRequest) {
  try {
    await requireAuth()
    const { searchParams } = new URL(req.url)
    const date = searchParams.get('date')
    const month = searchParams.get('month')
    const year = searchParams.get('year')
    const therapistId = searchParams.get('therapistId')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')

    const where: Record<string, unknown> = {}
    if (date) {
      const d = new Date(date)
      const next = new Date(d)
      next.setDate(next.getDate() + 1)
      where.date = { gte: d, lt: next }
    } else if (month && year) {
      const start = new Date(parseInt(year), parseInt(month) - 1, 1)
      const end = new Date(parseInt(year), parseInt(month), 1)
      where.date = { gte: start, lt: end }
    } else if (year) {
      const start = new Date(parseInt(year), 0, 1)
      const end = new Date(parseInt(year) + 1, 0, 1)
      where.date = { gte: start, lt: end }
    }
    if (therapistId) where.therapistId = parseInt(therapistId)

    const [sales, total] = await Promise.all([
      prisma.sale.findMany({
        where,
        include: { therapist: true, service: true, customer: true, promotion: true },
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.sale.count({ where }),
    ])
    return Response.json({ sales, total, page, limit })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error'
    return Response.json({ error: msg }, { status: msg === 'Unauthorized' ? 401 : 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth()
    const body = await req.json()
    const sale = await prisma.sale.create({
      data: {
        receiptNo: generateReceiptNo(),
        date: new Date(body.date),
        time: body.time,
        customerId: body.customerId || null,
        customerName: body.customerName || null,
        customerPhone: body.customerPhone || null,
        therapistId: body.therapistId,
        serviceId: body.serviceId,
        normalPrice: body.normalPrice,
        promotionId: body.promotionId || null,
        promoLabel: body.promoLabel || null,
        discount: body.discount || 0,
        actualAmount: body.actualAmount,
        commission: body.commission,
        paymentMethod: body.paymentMethod || 'QR Code',
        isRequest: body.isRequest || false,
        requestFee: body.requestFee || 0,
        bookingId: body.bookingId || null,
        createdById: session.id,
      },
      include: { therapist: true, service: true, customer: true, promotion: true },
    })
    return Response.json({ sale })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error'
    return Response.json({ error: msg }, { status: msg === 'Unauthorized' ? 401 : 500 })
  }
}
