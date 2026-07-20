import { formatBaht } from "@/lib/constants"

type Row = {
  work_date: string
  therapist_id: string
  total_income: number
  status: string
}

export function MatrixView({
  rows,
  nameOf,
}: {
  rows: Row[]
  nameOf: Record<string, string>
}) {
  const dates = [...new Set(rows.map((r) => r.work_date))].sort()
  const therapistIds = [...new Set(rows.map((r) => r.therapist_id))]

  const cell = new Map<string, Row>()
  for (const r of rows) cell.set(`${r.therapist_id}|${r.work_date}`, r)

  const therapistTotal = (id: string) =>
    rows.filter((r) => r.therapist_id === id)
        .reduce((sum, r) => sum + Number(r.total_income), 0)

  const dayTotal = (date: string) =>
    rows.filter((r) => r.work_date === date)
        .reduce((sum, r) => sum + Number(r.total_income), 0)

  const sortedIds = therapistIds.sort((a, b) => therapistTotal(b) - therapistTotal(a))
  const grandTotal = rows.reduce((sum, r) => sum + Number(r.total_income), 0)

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border">
        <table className="text-xs">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="sticky left-0 bg-slate-50 px-3 py-2 text-left">หมอ</th>
              {dates.map((d) => (
                <th key={d} className="px-2 py-2 text-center whitespace-nowrap">
                  {Number(d.slice(8, 10))}
                </th>
              ))}
              <th className="px-3 py-2 text-right">รวม</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sortedIds.map((id) => (
              <tr key={id}>
                <td className="sticky left-0 bg-white px-3 py-2 font-medium whitespace-nowrap">
                  {nameOf[id] ?? "ไม่ระบุ"}
                </td>
                {dates.map((d) => {
                  const c = cell.get(`${id}|${d}`)
                  if (!c) {
                    return (
                      <td key={d} className="px-2 py-2 text-center text-slate-300">
                        –
                      </td>
                    )
                  }
                  const usedGuarantee = c.status === "ใช้ประกัน"
                  return (
                    <td
                      key={d}
                      className={`px-2 py-2 text-center whitespace-nowrap ${
                        usedGuarantee ? "bg-amber-100 font-medium text-amber-900" : ""
                      }`}
                    >
                      {formatBaht(Number(c.total_income))}
                    </td>
                  )
                })}
                <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                  {formatBaht(therapistTotal(id))}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 bg-slate-50 font-semibold">
            <tr>
              <td className="sticky left-0 bg-slate-50 px-3 py-2">รวม/วัน</td>
              {dates.map((d) => (
                <td key={d} className="px-2 py-2 text-center whitespace-nowrap">
                  {formatBaht(dayTotal(d))}
                </td>
              ))}
              <td className="px-3 py-2 text-right whitespace-nowrap">
                {formatBaht(grandTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-xs text-slate-500">
        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-900">สีเหลือง</span>{" "}
        = วันที่ใช้ประกัน · <span className="text-slate-300">–</span> = ไม่เข้างาน ·
        เลื่อนตารางซ้ายขวาได้
      </p>
    </div>
  )
}
