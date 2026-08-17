import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // service worker ต้องไม่ถูก cache — ไม่งั้นเครื่องพนักงานค้างตัวเก่าข้ามวัน
        // แล้วการแจ้งเตือนรุ่นใหม่ไม่มีผลจนกว่าจะล้างเบราว์เซอร์
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
