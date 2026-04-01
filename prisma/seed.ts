import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  // Create owner account
  const hash = await bcrypt.hash('sookkaya2026', 10)
  await prisma.user.upsert({
    where: { username: 'owner' },
    update: {},
    create: { username: 'owner', passwordHash: hash, role: 'owner', name: 'เจ้าของร้าน' },
  })

  // Create staff account
  const staffHash = await bcrypt.hash('staff1234', 10)
  await prisma.user.upsert({
    where: { username: 'staff' },
    update: {},
    create: { username: 'staff', passwordHash: staffHash, role: 'staff', name: 'พนักงานหน้าร้าน' },
  })

  // Default settings
  await prisma.setting.upsert({ where: { key: 'dailyMinimum' }, update: {}, create: { key: 'dailyMinimum', value: '500' } })
  await prisma.setting.upsert({ where: { key: 'requestFee' }, update: {}, create: { key: 'requestFee', value: '40' } })
  await prisma.setting.upsert({ where: { key: 'shopName' }, update: {}, create: { key: 'shopName', value: 'SOOKKAYA Thai Massage' } })

  console.log('✅ Seed complete!')
  console.log('👤 Owner: username=owner, password=sookkaya2026')
  console.log('👤 Staff: username=staff, password=staff1234')
}

main().catch(console.error).finally(() => prisma.$disconnect())
