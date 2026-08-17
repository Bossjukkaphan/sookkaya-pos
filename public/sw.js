// Service worker ของโซนพนักงาน — หน้าที่เดียวคือรับ Web Push แล้วเด้งแจ้งเตือน
// (ไม่ทำ offline cache: ระบบขายต้องอ่านข้อมูลสดเสมอ ห้ามเสิร์ฟของเก่าเด็ดขาด)
//
// โครง payload ต้องตรงกับ PushPayload ใน src/lib/push-message.ts
self.addEventListener("push", (event) => {
  if (!event.data) return
  let data
  try {
    data = event.data.json()
  } catch {
    return
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "สุขกายา POS", {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      // สั่นให้รู้สึกตอนอยู่ในกระเป๋า — เครื่องที่ไม่รองรับจะเมินค่านี้เอง
      vibrate: [120, 60, 120],
      // เรื่องเดียวกันเตือนซ้ำทับอันเดิม ไม่กองเป็นตับ
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      // ค้างจนพนักงานแตะเอง — คิวจองพลาดไม่ได้
      requireInteraction: true,
      data: { url: data.url || "/queue" },
    })
  )
})

// แตะแล้วเปิดหน้าคิวของวันนั้น — ถ้ามีแท็บระบบเปิดอยู่แล้วให้ใช้แท็บเดิม
self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || "/queue"
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
        for (const client of list) {
          if ("focus" in client) {
            client.navigate(target)
            return client.focus()
          }
        }
        return self.clients.openWindow(target)
      })
  )
})
