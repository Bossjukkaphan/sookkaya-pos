import "server-only"

export type LineIdentity = { userId: string; displayName?: string; pictureUrl?: string }

/** ชื่อจากไลน์อาจเป็น placeholder ได้จริง — เจอเคส name claim ใน id token เป็น "Loading..."
 *  (โปรไฟล์ฝั่ง LINE ยังโหลดไม่เสร็จตอนออก token) แล้วหลุดไปโผล่บนการ์ดคิวของร้าน
 *  ใช้กรองก่อนบันทึกทุกครั้ง: ชื่อว่าง/placeholder → null ให้ผู้เรียก fallback เอง */
export function cleanLineDisplayName(name: string | null | undefined): string | null {
  const n = (name ?? "").trim()
  if (!n) return null
  if (/^loading[.…\s]*$/i.test(n)) return null
  return n
}

/** ตรวจ idToken กับ LINE โดยตรง — ทางเดียวที่เชื่อได้ว่าใครเป็นใคร (ห้าม throw: server action ต้องเชื่อ contract นี้ได้เสมอ) */
export async function verifyLineIdToken(idToken: string): Promise<LineIdentity | null> {
  if (!idToken) return null
  try {
    const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        id_token: idToken,
        client_id: process.env.LINE_LOGIN_CHANNEL_ID!,
      }),
      cache: "no-store",
    })
    if (!res.ok) return null
    const d = (await res.json()) as { sub?: string; name?: string; picture?: string }
    if (!d.sub) return null
    return { userId: d.sub, displayName: d.name, pictureUrl: d.picture }
  } catch {
    return null
  }
}

/** push ข้อความ text — คืน false เมื่อส่งไม่สำเร็จ (ห้าม throw: การจองต้องเดินต่อ) */
export async function pushLineMessage(to: string, text: string): Promise<boolean> {
  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
    })
    return res.ok
  } catch {
    return false
  }
}
