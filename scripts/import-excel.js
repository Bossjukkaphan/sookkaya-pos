const XLSX = require('xlsx');
const { PrismaClient } = require('@prisma/client');
const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');
const path = require('path');

const dbDir = process.env.DATABASE_PATH || '.';
const dbPath = path.join(dbDir, 'dev.db');
const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
const prisma = new PrismaClient({ adapter });

const FILE = '/Users/jw/Downloads/Final_SOOKKAYA_System_Apr2569.xlsx';

function excelToDate(serial) {
  if (!serial || typeof serial !== 'number' || serial < 40000) return null;
  // Fix for Thai Buddhist year dates (e.g., 244417 = วันที่ผิด)
  if (serial > 100000) return null;
  return new Date((serial - 25569) * 86400 * 1000);
}

function excelTimeToString(val) {
  if (!val && val !== 0) return '00:00';
  if (typeof val === 'string') return val;
  // Excel time as fraction of day
  const totalMinutes = Math.round(val * 24 * 60);
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function extractDuration(serviceName) {
  const match = serviceName.match(/(\d+)\s*นาที/);
  return match ? parseInt(match[1]) : 60;
}

async function main() {
  const wb = XLSX.readFile(FILE);

  // ===== 1. Clear existing data (keep users) =====
  console.log('Clearing existing data...');
  await prisma.sale.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.therapistPayItem.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.service.deleteMany();
  await prisma.therapist.deleteMany();
  await prisma.promotion.deleteMany();
  // Reset settings except system ones
  console.log('Done clearing.');

  // ===== 2. Import Therapists =====
  const therapistNames = ['รัน', 'แพท', 'ไล', 'อ้อย', 'หยง', 'ไข่ (freelance)', 'โจโจ้', 'เกด'];
  const therapistMap = {};
  for (const name of therapistNames) {
    const type = name.includes('freelance') ? 'freelance' : 'staff';
    const t = await prisma.therapist.create({
      data: { name, type, dailyMinimum: 500, requestFee: 40, active: true }
    });
    therapistMap[name] = t.id;
    console.log(`Therapist: ${name} -> id ${t.id}`);
  }

  // ===== 3. Import Services =====
  // Merge settings + extra services from sales
  const settingsSheet = XLSX.utils.sheet_to_json(wb.Sheets['ตั้งค่า'], { header: 1 });
  const serviceMap = {};

  // From settings (official prices)
  for (let i = 3; i < 25; i++) {
    const r = settingsSheet[i];
    if (r && r[3] && typeof r[3] === 'string' && r[3] !== 'ชื่อเมนูบริการ') {
      serviceMap[r[3]] = { name: r[3], price: r[4] || 0, commission: r[5] || 0 };
    }
  }

  // Extra services from sales (not in settings)
  const salesSheet = XLSX.utils.sheet_to_json(wb.Sheets['บันทึกขาย'], { header: 1 });
  const extraServices = {
    'ทรีตเมนต์ขัดผิว และนวดน้ำมันหอมระเหย 90 นาที': { price: 1290, commission: 300 },
    'ทรีตเมนต์ขัดผิว และนวดน้ำมันหอมระเหย 120 นาที': { price: 1590, commission: 400 },
    'นวดแก้ออฟฟิศซินโดรม 90 นาที': { price: 1290, commission: 330 },
    'นวดแก้ออฟฟิศซินโดรม 120 นาที': { price: 1590, commission: 400 },
    'นวดศีรษะ ดั้งเดิม 60 นาที': { price: 690, commission: 170 },
  };
  for (const [name, data] of Object.entries(extraServices)) {
    if (!serviceMap[name]) {
      serviceMap[name] = { name, price: data.price, commission: data.commission };
    }
  }

  const serviceIdMap = {};
  for (const svc of Object.values(serviceMap)) {
    const s = await prisma.service.create({
      data: {
        name: svc.name,
        durationMin: extractDuration(svc.name),
        price: Math.round(svc.price),
        commission: Math.round(svc.commission),
        active: true,
      }
    });
    serviceIdMap[svc.name] = s.id;
    console.log(`Service: ${svc.name} (${s.price}฿, commission ${s.commission}฿) -> id ${s.id}`);
  }

  // ===== 4. Import Customers =====
  const crmSheet = XLSX.utils.sheet_to_json(wb.Sheets['ข้อมูลลูกค้า (CRM)'], { header: 1 });
  const customerMap = {}; // name -> id
  const customerPhoneMap = {}; // phone -> id

  for (let i = 3; i < crmSheet.length; i++) {
    const r = crmSheet[i];
    if (!r || !r[1]) continue;
    const name = String(r[1]).trim();
    const nickname = r[2] ? String(r[2]).trim() : null;
    const phone = r[3] ? String(r[3]).trim() : null;
    const lineId = r[4] ? String(r[4]).trim() : null;
    const birthday = r[5] ? String(r[5]).trim() : null;
    const notes = r[13] ? String(r[13]).trim() : null;

    const c = await prisma.customer.create({
      data: { name, nickname, phone, lineId, birthday, notes, active: true }
    });
    customerMap[name] = c.id;
    if (phone) customerPhoneMap[phone] = c.id;
  }
  console.log(`Imported ${Object.keys(customerMap).length} customers`);

  // ===== 5. Import Sales =====
  let salesImported = 0;
  let salesSkipped = 0;
  let receiptCounter = 1;

  for (let i = 2; i < salesSheet.length; i++) {
    const r = salesSheet[i];
    if (!r) continue;

    const serviceName = r[6];
    if (!serviceName || !serviceIdMap[serviceName]) continue;

    const therapistName = r[5];
    if (!therapistName || !therapistMap[therapistName]) {
      salesSkipped++;
      continue;
    }

    const date = excelToDate(r[0]);
    if (!date) {
      salesSkipped++;
      continue;
    }

    const time = excelTimeToString(r[1]);
    const receiptNo = r[2] ? String(r[2]).trim() : `#IMP-${String(receiptCounter++).padStart(5, '0')}`;
    const customerName = r[3] ? String(r[3]).trim() : null;
    const customerPhone = r[4] ? String(r[4]).trim() : null;
    const normalPrice = Math.round(r[7] || 0);
    const promoLabel = r[8] ? String(r[8]).trim() : null;
    const discount = Math.round(r[9] || 0);
    const actualAmount = Math.round(r[10] || 0);
    const commission = Math.round(r[11] || 0);
    const paymentMethod = r[12] ? String(r[12]).trim() : 'QR Code';
    const isRequest = r[13] === true || r[13] === '☑' || r[13] === 1;
    const requestFee = Math.round(r[14] || 0);

    // Find customer
    let customerId = null;
    if (customerName && customerMap[customerName]) {
      customerId = customerMap[customerName];
    } else if (customerPhone && customerPhoneMap[customerPhone]) {
      customerId = customerPhoneMap[customerPhone];
    }

    // Ensure unique receipt number
    let finalReceipt = receiptNo;
    if (!receiptNo || receiptNo === 'null') {
      finalReceipt = `#IMP-${String(receiptCounter++).padStart(5, '0')}`;
    }

    try {
      await prisma.sale.create({
        data: {
          receiptNo: finalReceipt,
          date,
          time,
          customerId,
          customerName,
          customerPhone: customerPhone || null,
          therapistId: therapistMap[therapistName],
          serviceId: serviceIdMap[serviceName],
          normalPrice,
          promoLabel,
          discount,
          actualAmount,
          commission,
          paymentMethod: paymentMethod || 'QR Code',
          isRequest,
          requestFee,
        }
      });
      salesImported++;
    } catch (e) {
      // Duplicate receipt - add suffix
      try {
        await prisma.sale.create({
          data: {
            receiptNo: `${finalReceipt}-${receiptCounter++}`,
            date,
            time,
            customerId,
            customerName,
            customerPhone: customerPhone || null,
            therapistId: therapistMap[therapistName],
            serviceId: serviceIdMap[serviceName],
            normalPrice,
            promoLabel,
            discount,
            actualAmount,
            commission,
            paymentMethod: paymentMethod || 'QR Code',
            isRequest,
            requestFee,
          }
        });
        salesImported++;
      } catch (e2) {
        console.error(`Failed sale row ${i}:`, e2.message);
        salesSkipped++;
      }
    }
  }
  console.log(`Sales: imported ${salesImported}, skipped ${salesSkipped}`);

  // ===== 6. Import Expenses =====
  const expSheet = XLSX.utils.sheet_to_json(wb.Sheets['รายจ่าย'], { header: 1 });
  let expImported = 0;

  for (let i = 2; i < expSheet.length; i++) {
    const r = expSheet[i];
    if (!r || !r[1] || !r[3]) continue;

    let date = excelToDate(r[0]);
    if (!date) continue;

    const description = String(r[1]).trim();
    const category = r[2] ? String(r[2]).trim() : 'อื่นๆ';
    const amount = parseFloat(r[3]) || 0;
    const paidBy = r[4] ? String(r[4]).trim() : null;
    const notes = r[5] ? String(r[5]).trim() : null;

    await prisma.expense.create({
      data: { date, description, category, amount, paidBy, notes }
    });
    expImported++;
  }
  console.log(`Expenses: imported ${expImported}`);

  // ===== 7. Update Settings =====
  const settingsData = [
    { key: 'dailyMinimum', value: '500' },
    { key: 'requestFee', value: '40' },
    { key: 'shopName', value: 'SOOKKAYA Thai Massage' },
  ];
  for (const s of settingsData) {
    await prisma.setting.upsert({
      where: { key: s.key },
      update: { value: s.value },
      create: { key: s.key, value: s.value },
    });
  }
  console.log('Settings updated.');

  // ===== Summary =====
  const counts = {
    therapists: await prisma.therapist.count(),
    services: await prisma.service.count(),
    customers: await prisma.customer.count(),
    sales: await prisma.sale.count(),
    expenses: await prisma.expense.count(),
  };
  console.log('\n✅ Import complete!');
  console.log(counts);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
