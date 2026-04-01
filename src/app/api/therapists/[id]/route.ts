import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireOwner } from '@/lib/auth'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireOwner()
    const { id } = await params
    const body = await req.json()
    const therapist = await prisma.therapist.update({ where: { id: parseInt(id) }, data: body })
    return Response.json({ therapist })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error'
    return Response.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : 500 })
  }
}
