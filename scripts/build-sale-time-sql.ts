import { readFileSync, writeFileSync } from "node:fs"
import { parseExcelTime } from "../src/lib/excel-time.ts"

type RawRow = { receipt_no: string; raw: unknown }

const rows: RawRow[] = JSON.parse(
  readFileSync(new URL("./sale-times-raw.json", import.meta.url), "utf8")
)

const parsed: { receipt: string; time: string }[] = []
let unparsed = 0

for (const row of rows) {
  const time = parseExcelTime(row.raw)
  if (time === null) {
    unparsed += 1
    continue
  }
  parsed.push({ receipt: row.receipt_no, time })
}

const values = parsed
  .map((p) => `('${p.receipt.replace(/'/g, "''")}','${p.time}')`)
  .join(",\n")

writeFileSync(
  new URL("./sale-time-backfill.sql", import.meta.url),
  `update public.sales s
set sale_time = v.t::time
from (values
${values}
) as v(receipt_no, t)
where s.receipt_no = v.receipt_no
  and s.sale_time is null;
`
)

console.log(`แปลงได้ ${parsed.length} · แปลงไม่ได้ ${unparsed}`)
