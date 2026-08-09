# Speed Pass — ตัวเลขวัดจริง

เป้า: skeleton ภายใน ~100ms หลังกด · เนื้อหาจริง ~1s บนมือถือ 4G

## Baseline (ก่อนแก้ — วันที่วัด: 2026-08-09)

| หน้า | TTFB มัธยฐาน | หมายเหตุ |
|---|---|---|
| /login | 4ms | วัดได้แค่ /login (ระบุ unauthenticated) |

จำนวนจังหวะรอเรียงกัน (นับจากโค้ด ณ baseline):
- layout: auth.getUser → profiles → Promise.all(queue/birthday/expense) = 3 จังหวะ (~5 query)
- ไม่มี loading.tsx ในทุก route · Suspense มีแค่ commission/summary

## หลังเฟส 1 / 2 / 3 (เติมเมื่อวัดซ้ำ)
