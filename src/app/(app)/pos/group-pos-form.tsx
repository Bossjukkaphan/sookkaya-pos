"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { createSale } from "../sale-actions"
import { CustomerPicker } from "./customer-picker"
import { formatBaht } from "@/lib/constants"
import { PAY_SELECTED, PAY_COLOR_DEFAULT } from "@/lib/payment-colors"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"

type Therapist = { id: string; name: string }
type Service = { id: string; name: string; price: number; commission: number }
type Promotion = { id: string; name: string }

/** ข้อมูลหนึ่งคนในกลุ่ม เตรียมมาจากการ์ดคิวฝั่ง server */
export type GroupPerson = {
  queueEntryId: string
  groupId: string
  therapistId: string
  serviceId: string
  customerId: string
  customerName: string
  customerPhone: string
  serviceTime: string
  bedId: string
  source: string
  bookingChannel: string
  notes: string
}

/**
 * เก็บเงินทั้งกลุ่มในจอเดียว — เบื้องหลังยังบันทึก 1 บิลต่อ 1 คนผ่าน createSale เดิม
 * (สูตรเงิน/ค่ามือ/การปิดคิวรายใบ ใช้เส้นทางเดียวกับบิลเดี่ยวทุกประการ)
 *
 * จ่ายร่วมได้เฉพาะช่องทางเงินจริง — เครดิตสมาชิกผูกกับตัวบุคคล และ Gowabi/KOL
 * ต้องกรอกรหัสจองรายคน จึงให้แยกไปกดเก็บเงินรายคนตามเดิม
 */
const GROUP_PAYMENT_METHODS = ["เงินสด", "QR Code", "บัตรเครดิต"] as const

/** คนเปล่าสำหรับโหมด standalone (เพิ่มคนเองในหน้า POS ไม่ผ่านคิว) */
function blankPerson(groupId: string): GroupPerson {
  return {
    queueEntryId: "",
    groupId,
    therapistId: "",
    serviceId: "",
    customerId: "",
    customerName: "",
    customerPhone: "",
    serviceTime: "",
    bedId: "",
    source: "walk_in",
    bookingChannel: "",
    notes: "",
  }
}

export function GroupPosForm({
  therapists,
  services,
  promotions,
  people: initialPeople,
  standalone = false,
}: {
  therapists: Therapist[]
  services: Service[]
  promotions: Promotion[]
  people: GroupPerson[]
  /** เปิดจากหน้า POS ตรงๆ (ไม่ผ่านคิว) — เพิ่ม/ลบคน + แก้ชื่อได้ */
  standalone?: boolean
}) {
  const router = useRouter()
  // โหมด standalone สร้าง group id ใหม่ครั้งเดียวตอน mount — ทุกบิลผูกกลุ่มเดียวกัน
  const [standaloneGroupId] = useState(() =>
    standalone ? crypto.randomUUID() : ""
  )
  const [people, setPeople] = useState(() =>
    (standalone && initialPeople.length === 0
      ? [blankPerson(standaloneGroupId), blankPerson(standaloneGroupId)]
      : initialPeople
    ).map((p) => ({ ...p, discount: "", couponPromo: "" }))
  )
  const [paymentMethod, setPaymentMethod] = useState("")
  // บันทึกทีละใบตามลำดับ — ใบที่สำเร็จแล้วปิดคิวไปเลย ใบที่เหลือยังอยู่ให้ลองใหม่
  const [savingIndex, setSavingIndex] = useState<number | null>(null)

  const serviceById = useMemo(
    () => new Map(services.map((s) => [s.id, s])),
    [services]
  )

  const nets = people.map((p) => {
    const price = serviceById.get(p.serviceId)?.price ?? 0
    return Math.max(0, price - (Number(p.discount) || 0))
  })
  const total = nets.reduce((s, n) => s + n, 0)

  function setPerson(i: number, patch: Partial<(typeof people)[number]>) {
    setPeople((arr) => arr.map((p, j) => (j === i ? { ...p, ...patch } : p)))
  }

  async function submitAll() {
    if (!paymentMethod) {
      toast.error("เลือกช่องทางชำระเงินก่อน")
      return
    }
    const receipts: string[] = []
    for (let i = 0; i < people.length; i++) {
      const p = people[i]
      setSavingIndex(i)
      const fd = new FormData()
      fd.set("therapist_id", p.therapistId)
      fd.set("service_id", p.serviceId)
      fd.set("payment_method", paymentMethod)
      fd.set("discount", p.discount || "0")
      fd.set("coupon_promo", p.couponPromo)
      fd.set("customer_id", p.customerId)
      fd.set("customer_name", p.customerName)
      fd.set("customer_phone", p.customerPhone)
      fd.set("source", p.source)
      fd.set("booking_channel", p.bookingChannel)
      fd.set("bed_id", p.bedId)
      fd.set("notes", p.notes)
      fd.set("sale_time", p.serviceTime)
      fd.set("queue_entry_id", p.queueEntryId)
      fd.set("group_id", p.groupId)

      const r = await createSale(fd)
      if (!r.ok) {
        setSavingIndex(null)
        toast.error(
          `คนที่ ${i + 1} (${p.customerName || "ไม่ระบุชื่อ"}) บันทึกไม่สำเร็จ: ${r.error}` +
            (receipts.length > 0
              ? ` — ${receipts.length} คนแรกบันทึกแล้ว ที่เหลือยังอยู่ในคิว`
              : "")
        )
        // คนที่บันทึกแล้วถูกปิดคิวไปแล้ว โหลดหน้าใหม่จะเหลือเฉพาะคนที่ยังไม่จ่าย
        if (receipts.length > 0) router.refresh()
        return
      }
      receipts.push(r.receiptNo)
    }
    setSavingIndex(null)
    toast.success(`บันทึกครบ ${receipts.length} บิล — กลุ่มนี้ชำระแล้วทั้งหมด`)
    router.push("/queue")
  }

  return (
    <div className="space-y-4 pb-4">
      <ul className="space-y-3">
        {people.map((p, i) => {
          const service = serviceById.get(p.serviceId)
          return (
            <li key={p.queueEntryId || `person-${i}`}>
              <Card className={savingIndex === i ? "ring-2 ring-emerald-400" : undefined}>
                <CardContent className="space-y-2.5 py-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold">
                      คนที่ {i + 1}
                      {!standalone && (
                        <span className="ml-1 font-normal text-slate-500">
                          {p.customerName || "ไม่ระบุชื่อ"}
                        </span>
                      )}
                    </p>
                    <p className="text-lg font-bold whitespace-nowrap text-emerald-700">
                      {formatBaht(nets[i])} ฿
                    </p>
                    {standalone && people.length > 2 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="shrink-0 text-red-600"
                        aria-label={`ลบคนที่ ${i + 1}`}
                        onClick={() =>
                          setPeople((arr) => arr.filter((_, j) => j !== i))
                        }
                      >
                        ✕
                      </Button>
                    )}
                  </div>

                  {/* ค้นหาลูกค้าตัวเดียวกับฟอร์มเดี่ยว — พิมพ์แล้วชื่อ/เบอร์ที่เคยมาเด้งให้เลือก
                      เลือกแล้วเห็นเครดิตสมาชิกคงเหลือ + บิลผูก customer_id ลงประวัติลูกค้าถูกคน */}
                  {standalone && (
                    <CustomerPicker
                      customerId={p.customerId}
                      customerName={p.customerName}
                      customerPhone={p.customerPhone}
                      onPick={(c) =>
                        setPerson(i, {
                          customerId: c.id,
                          customerName: c.name,
                          customerPhone: c.phone ?? "",
                        })
                      }
                      onNameChange={(name) =>
                        setPerson(i, { customerName: name, customerId: "" })
                      }
                      onPhoneChange={(phone) => setPerson(i, { customerPhone: phone })}
                      requireMember={false}
                    />
                  )}

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <select
                      value={p.therapistId}
                      onChange={(e) => setPerson(i, { therapistId: e.target.value })}
                      className="h-11 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none"
                      aria-label={`หมอนวดคนที่ ${i + 1}`}
                    >
                      <option value="">— เลือกหมอ —</option>
                      {therapists.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={p.serviceId}
                      onChange={(e) => setPerson(i, { serviceId: e.target.value })}
                      className="h-11 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none"
                      aria-label={`เมนูคนที่ ${i + 1}`}
                    >
                      <option value="">— เลือกเมนู —</option>
                      {services.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} · {formatBaht(s.price)}฿
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      placeholder="ส่วนลด (฿)"
                      value={p.discount}
                      onChange={(e) => setPerson(i, { discount: e.target.value })}
                      className="h-11"
                      aria-label={`ส่วนลดคนที่ ${i + 1}`}
                    />
                    <select
                      value={p.couponPromo}
                      onChange={(e) => setPerson(i, { couponPromo: e.target.value })}
                      className="h-11 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none"
                      aria-label={`โปรโมชั่นคนที่ ${i + 1}`}
                    >
                      <option value="">ไม่ใช้โปรฯ</option>
                      {promotions.map((pr) => (
                        <option key={pr.id} value={pr.name}>
                          {pr.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {service && (
                    <p className="text-xs text-slate-500">
                      ราคาปกติ {formatBaht(service.price)} ฿
                      {p.serviceTime ? ` · เวลาใช้บริการ ${p.serviceTime}` : ""}
                    </p>
                  )}
                </CardContent>
              </Card>
            </li>
          )
        })}
      </ul>

      {standalone && (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() =>
            setPeople((arr) => [
              ...arr,
              { ...blankPerson(standaloneGroupId), discount: "", couponPromo: "" },
            ])
          }
        >
          + เพิ่มคนในกลุ่ม
        </Button>
      )}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">
          ช่องทางชำระเงิน <span className="font-normal text-slate-500">(จ่ายรวมครั้งเดียวทั้งกลุ่ม)</span>
        </legend>
        <div className="grid grid-cols-3 gap-2">
          {GROUP_PAYMENT_METHODS.map((m) => (
            <Button
              key={m}
              type="button"
              variant="outline"
              className={
                paymentMethod === m
                  ? (PAY_SELECTED[m] ?? PAY_COLOR_DEFAULT)
                  : undefined
              }
              onClick={() => setPaymentMethod(m)}
            >
              {m}
            </Button>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          จ่ายด้วยเครดิตสมาชิก / Gowabi / KOL — กด &quot;เก็บเงิน&quot; รายคนจากการ์ดคิวแทน
          (เครดิตผูกกับตัวบุคคล ส่วน Gowabi ต้องกรอกรหัสจองรายคน)
        </p>
      </fieldset>

      <div className="rounded-xl border-2 border-emerald-500 bg-emerald-50 px-4 py-3">
        <div className="flex items-baseline justify-between">
          <span className="font-semibold">รวมทั้งกลุ่ม ({people.length} คน)</span>
          <span className="text-2xl font-extrabold text-emerald-800">
            {formatBaht(total)} ฿
          </span>
        </div>
      </div>

      <Button
        type="button"
        className="h-12 w-full"
        disabled={
          savingIndex !== null ||
          people.some((p) => !p.therapistId || !p.serviceId)
        }
        onClick={submitAll}
      >
        {savingIndex !== null
          ? `กำลังบันทึกคนที่ ${savingIndex + 1}/${people.length}...`
          : `บันทึก ${people.length} บิล — รับเงิน ${formatBaht(total)} ฿`}
      </Button>
      {people.some((p) => !p.therapistId || !p.serviceId) && (
        <p className="text-center text-xs text-amber-700">
          เลือกหมอนวดและเมนูให้ครบทุกคนก่อนบันทึก
        </p>
      )}
    </div>
  )
}
