// scripts/measure-ttfb.mjs
// วัด TTFB ของหน้าหลัก ก่อน-หลัง Speed Pass — รัน 5 รอบเอาค่ามัธยฐาน กัน jitter รอบเดียวหลอกตา
// ใช้: MEASURE_COOKIE='sb-...=...' node scripts/measure-ttfb.mjs
const BASE = process.env.MEASURE_BASE_URL ?? "https://sookkaya-pos.vercel.app"
const COOKIE = process.env.MEASURE_COOKIE ?? ""
// ไม่มีคุกกี้วัดได้แค่ /login — หน้าในระบบโดน proxy เด้งไป /login ตัวเลขจะไม่ใช่ของจริง
const PAGES = COOKIE ? ["/", "/today", "/pos", "/queue", "/overview", "/history"] : ["/login"]
const ROUNDS = 5

async function ttfb(path) {
  const start = performance.now()
  const res = await fetch(BASE + path, {
    headers: COOKIE ? { cookie: COOKIE } : {},
    redirect: "manual",
  })
  await res.body?.getReader().read() // byte แรกของ body = TTFB จริง ไม่ใช่แค่ header
  return { ms: performance.now() - start, status: res.status }
}

for (const page of PAGES) {
  const runs = []
  for (let i = 0; i < ROUNDS; i++) runs.push(await ttfb(page))
  const sorted = runs.map((r) => r.ms).sort((a, b) => a - b)
  const median = sorted[Math.floor(ROUNDS / 2)]
  console.log(
    `${page.padEnd(12)} median ${median.toFixed(0)}ms  (status ${runs[0].status}, ${ROUNDS} รอบ: ${sorted.map((m) => m.toFixed(0)).join(" ")})`
  )
}
