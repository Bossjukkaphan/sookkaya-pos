import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { requireOwner } from '@/lib/auth'

export async function GET() {
  try {
    await requireOwner()
    const users = await prisma.user.findMany({ select: { id: true, username: true, name: true, role: true, active: true, createdAt: true } })
    return Response.json({ users })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error'
    return Response.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : 401 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireOwner()
    const body = await req.json()
    const hash = await bcrypt.hash(body.password, 10)
    const user = await prisma.user.create({
      data: { username: body.username, passwordHash: hash, role: body.role || 'staff', name: body.name },
      select: { id: true, username: true, name: true, role: true, active: true },
    })
    return Response.json({ user })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error'
    return Response.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : 500 })
  }
}
