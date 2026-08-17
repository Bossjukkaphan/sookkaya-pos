-- แจ้งเตือนคิวจองใหม่ถึงมือถือพนักงานแม้ไม่ได้เปิดหน้าเว็บ (Web Push)
-- เหตุ: 17/8/2569 ลูกค้าจอง 13:09 แต่ไม่มีใครรู้จนถึง 14:42 — ตอนนั้นไม่มีเครื่องไหน
-- เปิดระบบอยู่ (realtime ปิดเพราะ "no connected users") และ LINE OA ผู้ช่วยโควตาเต็ม
-- ส่งเข้ากลุ่มไม่ได้ตั้งแต่ 10/8 — ไม่เหลือช่องทางเตือนเลยสักทาง
--
-- หนึ่งแถว = หนึ่งเบราว์เซอร์/เครื่อง (ผู้ใช้คนเดียวมีได้หลายเครื่อง)
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- endpoint คือรหัสประจำเครื่องที่ผู้ให้บริการ push ออกให้ — ซ้ำไม่ได้
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  -- ไว้ให้เจ้าของร้านดูว่าเครื่องไหนเปิดเตือนอยู่บ้าง
  user_agent text,
  created_at timestamptz not null default now(),
  -- ส่งสำเร็จครั้งล่าสุด · ใช้ดูว่าเครื่องไหนเงียบไปนานแล้ว
  last_success_at timestamptz
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- พนักงานจัดการเฉพาะการสมัครของตัวเอง (auth.uid() = user_id)
-- ตัวส่งจริงใช้ service role ซึ่งข้าม RLS อยู่แล้ว จึงอ่านของทุกคนได้
create policy "own push subscription select" on public.push_subscriptions
  for select to authenticated using (auth.uid() = user_id);
create policy "own push subscription insert" on public.push_subscriptions
  for insert to authenticated with check (auth.uid() = user_id);
create policy "own push subscription update" on public.push_subscriptions
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own push subscription delete" on public.push_subscriptions
  for delete to authenticated using (auth.uid() = user_id);
