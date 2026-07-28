-- index ตาม btrim(phone) เพราะ v_customer_issues เทียบเบอร์แบบตัดช่องว่างหัวท้าย
-- index เดิม customers_phone_idx เป็น (phone) เฉยๆ จึงใช้กับ btrim(phone) ไม่ได้
-- ทำให้ธง dup_phone ต้อง Seq Scan ตาราง customers ซ้ำทุกแถว (973 รอบ ≈ 400ms ต่อ query)
-- และหน้า /customers ยิง query แบบนั้น 6 ครั้งต่อการโหลด — โตแบบกำลังสองตามจำนวนลูกค้า
create index if not exists customers_phone_btrim_idx on public.customers (btrim(phone));
