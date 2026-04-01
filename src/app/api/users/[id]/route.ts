import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { requireOwner } from '@/lib/auth'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireOwner()
    const { id } = await params
    const body = await req.json()
    if (body.password) {
      body.passwordHash = await bcrypt.hash(body.password, 10)
      delete body.password
    }
    const user = await prisma.user.update({
      where: { id: parseInt(id) },
      data: body,
      select: { id: true, username: true, name: true, role: true, active: true },
    })
    return Response.json({ user })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error'
    return Response.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : 500 })
  }
}
