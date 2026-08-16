/** เส้นแนวโน้มจิ๋วในเซลล์ตาราง — SVG ล้วน ไม่พึ่งไลบรารีกราฟ */
export function Sparkline({ values, width = 96, height = 24 }: {
  values: number[]
  width?: number
  height?: number
}) {
  const pts = values.filter((v) => Number.isFinite(v))
  if (pts.length < 2) return <span className="text-xs text-slate-400">–</span>
  const min = Math.min(...pts)
  const max = Math.max(...pts)
  const span = max - min || 1
  const step = width / (pts.length - 1)
  const points = pts
    .map((v, i) => `${(i * step).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`)
    .join(" ")
  return (
    <svg width={width} height={height} aria-hidden className="text-slate-400">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle
        cx={((pts.length - 1) * step).toFixed(1)}
        cy={(height - 2 - ((pts[pts.length - 1] - min) / span) * (height - 4)).toFixed(1)}
        r="2.5" fill="currentColor" className="text-emerald-600"
      />
    </svg>
  )
}
