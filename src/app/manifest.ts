import type { MetadataRoute } from "next"

/** ติดตั้งลงหน้าจอโฮมได้ — บน iPhone ต้องติดตั้งก่อนถึงจะรับ Web Push ได้ (iOS 16.4+)
 *  สีตามธีมร้าน: พื้นครีม #FFF0D1 · น้ำตาลแดง #664343 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "สุขกายา POS",
    short_name: "สุขกายา",
    description: "ระบบขายและจัดคิวร้านนวดสุขกายา",
    start_url: "/queue",
    display: "standalone",
    background_color: "#FFF0D1",
    theme_color: "#664343",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  }
}
