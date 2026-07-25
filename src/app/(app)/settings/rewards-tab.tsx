"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { saveReward, toggleReward } from "./settings-actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ServiceCombobox } from "@/components/service-combobox"

type Reward = {
  id: string
  name: string
  service_id: string | null
  points_cost: number
  is_active: boolean
}
type Service = { id: string; name: string; price: number; duration_min: number | null }

/** แท็บของรางวัลแลกแต้ม — ชื่อ + แต้มที่ใช้ + ผูกเมนู (POS จะเลือกเมนูให้เองตอนใช้คูปอง) */
export function RewardsTab({
  rewards,
  services,
}: {
  rewards: Reward[]
  services: Service[]
}) {
  const router = useRouter()
  const [newName, setNewName] = useState("")
  const [newCost, setNewCost] = useState("")
  const [newServiceId, setNewServiceId] = useState("")
  const [saving, setSaving] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function submitNew(e: React.FormEvent) {
    e.preventDefault()
    setSaving("new")
    startTransition(async () => {
      const r = await saveReward({
        name: newName,
        pointsCost: Number(newCost),
        serviceId: newServiceId || null,
      })
      if (r.ok) {
        toast.success("เพิ่มของรางวัลแล้ว")
        setNewName("")
        setNewCost("")
        setNewServiceId("")
        router.refresh()
      } else {
        toast.error(r.error)
      }
      setSaving(null)
    })
  }

  function onToggle(reward: Reward) {
    setSaving(reward.id)
    startTransition(async () => {
      const r = await toggleReward(reward.id, !reward.is_active)
      if (r.ok) {
        toast.success(reward.is_active ? "ปิดรับแลกแล้ว" : "เปิดรับแลกแล้ว")
        router.refresh()
      } else {
        toast.error(r.error)
      }
      setSaving(null)
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold">ของรางวัลแลกแต้ม</h2>
        <p className="text-xs text-slate-500">
          ลูกค้าเห็นรายการนี้ในหน้าแต้มบนไลน์ · ทุก 100 บาทที่จ่ายจริง = 1 แต้ม ·
          บิลแลกรางวัลเก็บ 0 บาทแต่ค่ามือหมอจ่ายปกติ
        </p>
      </div>

      <ul className="space-y-2">
        {rewards.map((r) => (
          <li key={r.id}>
            <Card className={r.is_active ? "" : "opacity-60"}>
              <CardContent className="flex items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <p className="font-medium">{r.name}</p>
                  <p className="text-xs text-slate-500">
                    {r.points_cost.toLocaleString()} แต้ม
                    {r.service_id &&
                      ` · ${services.find((s) => s.id === r.service_id)?.name ?? "เมนูถูกลบ"}`}
                    {!r.is_active && " · ปิดรับแลก"}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={saving === r.id}
                  onClick={() => onToggle(r)}
                >
                  {r.is_active ? "ปิดรับแลก" : "เปิดรับแลก"}
                </Button>
              </CardContent>
            </Card>
          </li>
        ))}
        {rewards.length === 0 && (
          <p className="py-4 text-center text-sm text-slate-500">
            ยังไม่มีของรางวัล — เพิ่มด้านล่างได้เลย
          </p>
        )}
      </ul>

      <form onSubmit={submitNew} className="space-y-2 rounded-lg border p-3">
        <p className="text-sm font-medium">เพิ่มของรางวัลใหม่</p>
        <div className="space-y-1">
          <Label htmlFor="reward-name">ชื่อรางวัล</Label>
          <Input
            id="reward-name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="เช่น นวดแผนไทย 60 นาที ฟรี"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="reward-cost">แต้มที่ใช้แลก</Label>
          <Input
            id="reward-cost"
            type="number"
            inputMode="numeric"
            min={1}
            value={newCost}
            onChange={(e) => setNewCost(e.target.value)}
            placeholder="เช่น 400"
          />
        </div>
        <div className="space-y-1">
          <Label>
            ผูกเมนูบริการ{" "}
            <span className="font-normal text-slate-500">
              (แนะนำ — POS จะเลือกเมนูให้เองตอนใช้คูปอง)
            </span>
          </Label>
          <ServiceCombobox
            services={services}
            value={newServiceId}
            onChange={setNewServiceId}
            placeholder="— ไม่ผูกเมนู —"
          />
        </div>
        <Button
          type="submit"
          disabled={saving === "new" || !newName.trim() || !(Number(newCost) > 0)}
        >
          เพิ่มของรางวัล
        </Button>
      </form>
    </div>
  )
}
