import "server-only"

/** push ข้อความ text ผ่าน OA ผู้ช่วย (Sookkaya Assistant) — แยกขาดจาก OA ลูกค้าใน line.ts
 *  คืน false เงียบๆ เมื่อ env ยังไม่ตั้ง (ฟีเจอร์ dormant) หรือปลายทางว่าง หรือส่งไม่สำเร็จ
 *  (ห้าม throw: การจอง/ยกเลิกต้องเดินต่อเสมอ) */
export async function pushAssistantMessage(to: string, text: string): Promise<boolean> {
  const token = process.env.LINE_ASSISTANT_CHANNEL_TOKEN
  if (!token || !to) return false
  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
    })
    return res.ok
  } catch {
    return false
  }
}
