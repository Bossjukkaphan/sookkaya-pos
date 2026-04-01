#!/bin/sh
set -e

echo "Running database migrations..."
npx prisma migrate deploy

# Seed only if database is empty (first deploy)
node -e "
const { PrismaClient } = require('@prisma/client');
const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');
const path = require('path');
const dbDir = process.env.DATABASE_PATH || '.';
const dbPath = path.join(dbDir, 'dev.db');
const adapter = new PrismaBetterSqlite3({ url: 'file:' + dbPath });
const prisma = new PrismaClient({ adapter });
prisma.user.count().then(c => {
  if (c === 0) {
    console.log('Empty database, running seed...');
    const bcrypt = require('bcryptjs');
    Promise.all([
      bcrypt.hash('sookkaya2026', 10).then(h =>
        prisma.user.create({ data: { username: 'owner', passwordHash: h, role: 'owner', name: 'เจ้าของร้าน' } })
      ),
      bcrypt.hash('staff1234', 10).then(h =>
        prisma.user.create({ data: { username: 'staff', passwordHash: h, role: 'staff', name: 'พนักงานหน้าร้าน' } })
      ),
      prisma.setting.create({ data: { key: 'dailyMinimum', value: '500' } }),
      prisma.setting.create({ data: { key: 'requestFee', value: '40' } }),
      prisma.setting.create({ data: { key: 'shopName', value: 'SOOKKAYA Thai Massage' } }),
    ]).then(() => { console.log('Seed complete!'); process.exit(0); });
  } else {
    console.log('Database already has data, skipping seed.');
    process.exit(0);
  }
}).catch(e => { console.error(e); process.exit(1); });
"

echo "Starting server..."
exec node .next/standalone/server.js
