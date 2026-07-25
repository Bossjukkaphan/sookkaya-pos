"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { saveAlias, savePromotion } from "./settings-actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type Promotion = {
  id: string
  name: string
  kind: string
  is_active: boolean
  discount_pct: number | null
}
type Unmatched = { raw_key: string; sample_text: string; uses: number }
type Alias = { raw_key: string; sample_text: string; promotion_id: string | null }

const KIND_LABELS: Record<string, string> = {
  promotion: "โปรโมชั่น",
  channel: "ช่องทางขาย",
  giveaway: "ให้ฟรีเพื่อโปรโมท",
  internal: "ใช้ภายใน",
}

const NOT_A_PROMO = "__none__"

export function PromotionsTab({
  promotions,
  unmatched,
  aliases,
}: {
  promotions: Promotion[]
  unmatched: Unmatched[]
  aliases: Alias[]
}) {
  const router = useRouter()
  const [newName, setNewName] = useState("")
  const [newKind, setNewKind] = useState("promotion")
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    setSavingKey("new")
    startTransition(async () => {
      const result = await savePromotion(formData)
      if (result.ok) {
        toast.success("เพิ่มโปรโมชั่นแล้ว")
        setNewName("")
        router.refresh()
      } else {
        toast.error(result.error)
      }
      setSavingKey(null)
    })
  }

  function handlePct(p: Promotion, pct: string) {
    const fd = new FormData()
    fd.set("id", p.id)
    fd.set("name", p.name)
    fd.set("kind", p.kind)
    if (p.is_active) fd.set("is_active", "on")
    fd.set("discount_pct", pct)
    setSavingKey(p.id)
    startTransition(async () => {
      const result = await savePromotion(fd)
      if (result.ok) {
        toast.success(pct ? `ตั้งส่วนลดอัตโนมัติ ${pct}% แล้ว` : "ปิดส่วนลดอัตโนมัติแล้ว")
        router.refresh()
      } else {
        toast.error(result.error)
      }
      setSavingKey(null)
    })
  }

  function handleAlias(row: Unmatched, value: string) {
    setSavingKey(row.raw_key)
    startTransition(async () => {
      const result = await saveAlias(
        row.raw_key,
        value === NOT_A_PROMO ? null : value,
        row.sample_text
      )
      if (result.ok) {
        toast.success("จับคู่แล้ว")
        router.refresh()
      } else {
        toast.error(result.error)
      }
      setSavingKey(null)
    })
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">รายการโปรโมชั่น</h2>
          <p className="text-xs text-slate-500">
            ชื่อในรายการนี้จะขึ้นเป็นตัวเลือกในหน้าบันทึกขาย
            และเป็นชื่อที่ใช้รวมยอดในรายงาน ROI
          </p>
        </div>

        <ul className="space-y-2">
          {promotions.map((p) => (
            <li key={p.id}>
              <Card>
                <CardContent className="flex items-center justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-slate-500">
                      {KIND_LABELS[p.kind] ?? p.kind}
                      {p.discount_pct != null &&
                        ` · ลดอัตโนมัติ ${p.discount_pct}%`}
                      {!p.is_active && " · ปิดใช้แล้ว"}
                    </p>
                  </div>
                  <PctEditor
                    promo={p}
                    saving={savingKey === p.id}
                    onSave={(pct) => handlePct(p, pct)}
                  />
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>

        <form onSubmit={handleCreate} className="space-y-2 rounded-lg border p-3">
          <p className="text-sm font-medium">เพิ่มโปรโมชั่นใหม่</p>
          <div className="space-y-1">
            <Label htmlFor="promo-name">ชื่อ</Label>
            <Input
              id="promo-name"
              name="name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="เช่น ลด 20% วันเกิด"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="promo-pct">
              ส่วนลดอัตโนมัติ (%){" "}
              <span className="font-normal text-slate-500">
                — เว้นว่างถ้าไม่ให้ระบบคิดส่วนลดให้เอง
              </span>
            </Label>
            <Input
              id="promo-pct"
              name="discount_pct"
              type="number"
              inputMode="numeric"
              min={1}
              max={100}
              placeholder="เช่น 15"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="promo-kind">ประเภท</Label>
            <input type="hidden" name="kind" value={newKind} />
            <Select value={newKind} onValueChange={setNewKind}>
              <SelectTrigger id="promo-kind" className="h-10 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(KIND_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <input type="hidden" name="is_active" value="on" />
          <Button type="submit" disabled={savingKey === "new" || !newName.trim()}>
            เพิ่ม
          </Button>
        </form>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">ข้อความที่ยังไม่จับคู่</h2>
          <p className="text-xs text-slate-500">
            ข้อความที่เคยพิมพ์ในช่องโปรโมชั่นแต่ยังไม่รู้ว่าเป็นโปรฯ ตัวไหน
            ตราบใดที่ยังไม่จับคู่ ยอดพวกนี้จะไม่ถูกนับในรายงาน ROI
          </p>
        </div>

        {unmatched.length === 0 && (
          <p className="py-6 text-center text-sm text-slate-500">
            จับคู่ครบทุกข้อความแล้ว
          </p>
        )}

        <ul className="space-y-2">
          {unmatched.map((row) => (
            <li key={row.raw_key}>
              <Card>
                <CardContent className="space-y-2 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 font-medium break-words">
                      {row.sample_text}
                    </p>
                    <span className="shrink-0 text-xs text-slate-500">
                      {row.uses} ครั้ง
                    </span>
                  </div>
                  <AliasPicker
                    value={null}
                    disabled={savingKey === row.raw_key}
                    promotions={promotions}
                    onSelect={(v) => handleAlias(row, v)}
                  />
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">ข้อความที่จับคู่ไว้แล้ว</h2>
          <p className="text-xs text-slate-500">
            กดเปลี่ยนได้ถ้าจับคู่ผิด — ยอดในรายงาน ROI จะขยับตามทันที
            ({aliases.length} ข้อความ)
          </p>
        </div>

        <ul className="space-y-2">
          {aliases.map((a) => (
            <li key={a.raw_key}>
              <Card>
                <CardContent className="space-y-2 py-3">
                  <p className="min-w-0 font-medium break-words">{a.sample_text}</p>
                  <AliasPicker
                    value={a.promotion_id ?? NOT_A_PROMO}
                    disabled={savingKey === a.raw_key}
                    promotions={promotions}
                    onSelect={(v) =>
                      handleAlias(
                        { raw_key: a.raw_key, sample_text: a.sample_text, uses: 0 },
                        v
                      )
                    }
                  />
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

/** ช่องตั้ง % ส่วนลดอัตโนมัติต่อโปร — ว่าง = ไม่คิดให้เอง กดบันทึกเมื่อค่าเปลี่ยน */
function PctEditor({
  promo,
  saving,
  onSave,
}: {
  promo: Promotion
  saving: boolean
  onSave: (pct: string) => void
}) {
  const [pct, setPct] = useState(
    promo.discount_pct != null ? String(promo.discount_pct) : ""
  )
  const dirty = pct !== (promo.discount_pct != null ? String(promo.discount_pct) : "")
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Input
        type="number"
        inputMode="numeric"
        min={1}
        max={100}
        value={pct}
        onChange={(e) => setPct(e.target.value)}
        placeholder="%"
        className="h-9 w-16 text-right"
        aria-label={`ส่วนลด % ของ ${promo.name}`}
      />
      <span className="text-sm text-slate-500">%</span>
      {dirty && (
        <Button size="sm" variant="outline" disabled={saving} onClick={() => onSave(pct)}>
          บันทึก
        </Button>
      )}
    </div>
  )
}

function AliasPicker({
  value,
  disabled,
  promotions,
  onSelect,
}: {
  value: string | null
  disabled: boolean
  promotions: Promotion[]
  onSelect: (value: string) => void
}) {
  return (
    <Select
      // null = ยังไม่เคยเลือก จึงปล่อยให้ Select ว่างไว้ ถ้าใส่ค่าไปเลย
      // radix จะถือว่าเลือกค่านั้นอยู่แล้ว แล้วกดซ้ำจะไม่ยิง onValueChange
      value={value ?? undefined}
      disabled={disabled}
      onValueChange={onSelect}
    >
      <SelectTrigger className="h-10 w-full">
        <SelectValue placeholder="— เลือกว่าเป็นโปรฯ ตัวไหน —" />
      </SelectTrigger>
      <SelectContent>
        {promotions.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
          </SelectItem>
        ))}
        <SelectItem value={NOT_A_PROMO}>ไม่ใช่โปรโมชั่น (เป็นโน้ต)</SelectItem>
      </SelectContent>
    </Select>
  )
}
