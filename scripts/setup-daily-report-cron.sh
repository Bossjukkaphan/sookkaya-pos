#!/usr/bin/env bash
# ตั้ง pg_cron ให้ยิง Daily Report ตรง 22:00 น. — รันครั้งเดียวจากเครื่องตัวเอง
#
# push migration → ดึง CRON_SECRET จาก Vercel → เขียนไฟล์ SQL ที่เติมค่าพร้อมแล้ว
# ให้เอาไปวางใน SQL Editor ของ Supabase ขั้นเดียวจบ
#
# ขั้นสุดท้ายไม่ยิง SQL ให้เองเพราะ Supabase CLI ไม่ได้เป็น dependency ของโปรเจกต์นี้
# และ vault ต้องรันด้วยสิทธิ์ที่ SQL Editor มีอยู่แล้ว — วางเองชัวร์กว่าเดา subcommand
#
# ต้องมี: npx + ล็อกอิน vercel และ supabase ไว้แล้ว
# รายละเอียดและวิธีตรวจผล: docs/ops/daily-report-cron.md

set -euo pipefail

REPORT_URL="https://sookkaya-pos.vercel.app/api/cron/daily-report?source=pg_cron"
OUT_SQL="/tmp/daily-report-vault.sql"

cd "$(dirname "$0")/.."

echo "==> 1/3 push migration ขึ้น Supabase"
npx supabase db push

echo "==> 2/3 ดึง CRON_SECRET จาก Vercel production"
ENV_FILE="$(mktemp)"
# ลบไฟล์ทิ้งเสมอแม้สคริปต์ตายกลางคัน — ไฟล์นี้มี secret ทุกตัวของ production
trap 'rm -f "$ENV_FILE"' EXIT

npx vercel env pull "$ENV_FILE" --environment=production --yes >/dev/null
CRON_SECRET="$(grep '^CRON_SECRET=' "$ENV_FILE" | cut -d= -f2- | tr -d '"')"

if [ -z "$CRON_SECRET" ]; then
  echo "หา CRON_SECRET ใน env production ไม่เจอ — ตั้งก่อนด้วย:" >&2
  echo "  openssl rand -hex 32 | npx vercel env add CRON_SECRET production" >&2
  exit 1
fi

echo "==> 3/3 เขียนไฟล์ SQL ที่เติมค่าให้แล้ว"
umask 077  # ไฟล์นี้มี secret — ห้ามให้ user อื่นบนเครื่องอ่านได้
cat > "$OUT_SQL" <<SQL
-- ลบก่อนสร้างใหม่ ทำให้รันซ้ำได้โดยไม่ติด error ชื่อซ้ำ
delete from vault.secrets where name in ('daily_report_url', 'daily_report_cron_secret');

select vault.create_secret('${REPORT_URL}', 'daily_report_url');
select vault.create_secret('${CRON_SECRET}', 'daily_report_cron_secret');

-- ต้องได้ 1 แถว active = t
select jobname, schedule, active from cron.job where jobname = 'daily-report-2200-ict';
SQL

echo
echo "เหลือขั้นเดียว — เอาเนื้อไฟล์นี้ไปวางใน SQL Editor ของ Supabase แล้วรัน:"
echo "  $OUT_SQL"
echo
echo "macOS ก๊อปเข้าคลิปบอร์ดเลยก็ได้:  pbcopy < $OUT_SQL"
echo "วางเสร็จแล้วลบทิ้ง:               rm -f $OUT_SQL"
echo
echo "ทดสอบยิงจริงโดยไม่ต้องรอ 22:00 (รันใน SQL Editor):"
echo "  select public.trigger_daily_report();"
echo "  select status_code, content from net._http_response order by id desc limit 1;"
echo "ถ้าการ์ดของวันนี้ส่งไปแล้วจะได้ {\"ok\":true,\"skipped\":\"already-sent\"} ซึ่งถือว่าปกติ"
