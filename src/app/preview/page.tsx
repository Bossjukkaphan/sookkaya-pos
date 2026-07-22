// พรีวิวตรวจกราฟแบบโต้ตอบ · ลบทิ้งหลังตรวจ ห้าม commit
import { BarChart } from "@/components/charts/bar-chart"
import { LineChart } from "@/components/charts/line-chart"
import { GroupedBarChart } from "@/components/charts/grouped-bar-chart"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const months = ["ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค."]
const revenue = [174842, 347018, 289500, 312200, 298750, 154320]
const expense = [98200, 152400, 171300, 143800, 160200, 88100]
const profit = revenue.map((r, i) => r - expense[i])
const margin = [43.8, 56.1, 40.8, 53.9, -6.4, 42.9]

const pts = (vals: number[]) => vals.map((v, i) => ({ label: months[i], value: v }))

export default function Preview() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <p className="text-sm text-slate-500">แตะ/ชี้บนกราฟ เพื่อดูค่ารายจุด</p>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">แท่งกลุ่ม + เส้นกำไร</CardTitle>
        </CardHeader>
        <CardContent>
          <GroupedBarChart
            series={[
              { name: "รายได้", color: "#059669", points: pts(revenue) },
              { name: "รายจ่าย", color: "#f97316", points: pts(expense) },
            ]}
            line={{ name: "กำไรเงินสด", color: "#1e293b", points: pts(profit) }}
            unit=" ฿"
          />
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">กราฟเส้น Margin (มีค่าติดลบ)</CardTitle>
          </CardHeader>
          <CardContent>
            <LineChart points={pts(margin)} unit="%" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">กราฟแท่งเดี่ยว</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart points={pts(revenue)} unit=" ฿" />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
