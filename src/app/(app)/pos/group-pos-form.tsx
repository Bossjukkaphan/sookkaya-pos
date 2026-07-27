"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { createSale } from "../sale-actions"
import { CustomerPicker } from "./customer-picker"
import { PRIVATE_ROOM_FEE, REQUEST_FEE, formatBaht } from "@/lib/constants"
import {
  HAPPY_HOUR_KEY,
  happyHourDiscountBaht,
  promoDiscountBaht,
  promoKey,
} from "@/lib/promo"
import { Checkbox } from "@/components/ui/checkbox"
import { PAY_SELECTED, PAY_COLOR_DEFAULT } from "@/lib/payment-colors"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { ServiceCombobox } from "@/components/service-combobox"

type Therapist = { id: string; name: string }
type Service = { id: string; name: string; price: number; commission: number }
type Promotion = { id: string; name: string; discount_pct: number | null }

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
  /** รีเควสหมอจากคิว — คิดค่าตายตัวตอนบันทึก */
  isRequest: boolean
  /** ห้องสปาส่วนตัวจากคิว — +100 ลูกค้าจ่าย */
  privateRoom: boolean
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
    isRequest: false,
    privateRoom: false,
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
  // ลูกค้าคนเดียวทำหลายคอร์ส (จองแบบ "ต่อเวลา") → รวมทุกรายการเป็นบิลชุดใบเดียว
  const [mergeBill, setMergeBill] = useState(false)
  // บันทึกทีละใบตามลำดับ — ใบที่สำเร็จแล้วปิดคิวไปเลย ใบที่เหลือยังอยู่ให้ลองใหม่
  const [savingIndex, setSavingIndex] = useState<number | null>(null)

  const serviceById = useMemo(
    () => new Map(services.map((s) => [s.id, s])),
    [services]
  )

  const nets = people.map((p) => {
    const price = serviceById.get(p.serviceId)?.price ?? 0
    // ค่าห้องสปาลูกค้าจ่ายจริง — บวกให้ตรงกับที่ server คิด
    return (
      Math.max(0, price - (Number(p.discount) || 0)) +
      (p.privateRoom ? PRIVATE_ROOM_FEE : 0)
    )
  })
  const total = nets.reduce((s, n) => s + n, 0)

  function setPerson(i: number, patch: Partial<(typeof people)[number]>) {
    setPeople((arr) => arr.map((p, j) => (j === i ? { ...p, ...patch } : p)))
  }

  // เลือกโปรที่ตั้ง % ไว้ → เติมส่วนลดเป็นบาทเต็มให้คนนั้นเอง เปลี่ยนเมนูก็คิดใหม่
  function withPromoDiscount(
    p: (typeof people)[number],
    patch: { serviceId?: string; couponPromo?: string }
  ) {
    const svc = services.find((s) => s.id === (patch.serviceId ?? p.serviceId))
    const promo = promotions.find((x) => x.name === (patch.couponPromo ?? p.couponPromo))
    if (!svc || !promo) return patch
    // Happy Hour: เมนูนวด 90 นาที จ่ายราคา 60 — ส่วนลดคือส่วนต่างของสองราคา
    if (promoKey(promo.name) === HAPPY_HOUR_KEY) {
      const hh = happyHourDiscountBaht(svc, services)
      if (hh != null) {
        toast.info(`Happy Hour: จ่ายราคา 60 นาที (ลด ${hh} ฿) · ใช้ จ–ศ ก่อน 12:00`)
        return { ...patch, discount: String(hh) }
      }
      toast.warning("เมนูนี้ไม่เข้าเงื่อนไข Happy Hour — ต้องเป็นเมนูนวด 90 นาที (ทรีตเมนต์/คอบ่าไหล่ไม่ร่วม)")
      return patch
    }
    if (promo.discount_pct) {
      return { ...patch, discount: String(promoDiscountBaht(svc.price, promo.discount_pct)) }
    }
    return patch
  }

  async function submitAll() {
    if (!paymentMethod) {
      toast.error("เลือกช่องทางชำระเงินก่อน")
      return
    }
    // บิลชุด: พนักงานติ๊กเองว่าเป็นลูกค้าคนเดียวทำหลายคอร์ส — เดาจากข้อมูลไม่ได้
    // เพราะคิวกลุ่ม (ครอบครัว) ก็เก็บชื่อผู้ติดต่อคนเดียวลงทุกการ์ดเหมือนกัน
    const billId = mergeBill && people.length > 1 ? crypto.randomUUID() : ""
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
      if (billId) fd.set("bill_id", billId)
      if (p.isRequest) {
        fd.set("is_request", "on")
        fd.set("request_fee", String(REQUEST_FEE))
      }
      if (p.privateRoom) fd.set("private_room", "on")

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
                    <ServiceCombobox
                      services={services}
                      value={p.serviceId}
                      onChange={(serviceId) =>
                        setPerson(i, withPromoDiscount(p, { serviceId }))
                      }
                      aria-label={`เมนูคนที่ ${i + 1}`}
                      triggerClassName="h-11 text-sm"
                    />
                  </div>

                  {/* เวลาใช้บริการรายคน — โหมดกลุ่มเคยตั้งไม่ได้ (มีเฉพาะที่ติดมาจากคิว) */}
                  <div className="space-y-1">
                    <label
                      htmlFor={`g_time_${i}`}
                      className="text-xs font-medium text-slate-600"
                    >
                      เวลาใช้บริการ{" "}
                      <span className="font-normal text-slate-400">
                        (เว้นว่าง = เวลาบันทึก)
                      </span>
                    </label>
                    <Input
                      id={`g_time_${i}`}
                      type="time"
                      value={p.serviceTime}
                      onChange={(e) => setPerson(i, { serviceTime: e.target.value })}
                      className="h-11"
                      aria-label={`เวลาใช้บริการคนที่ ${i + 1}`}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      placeholder="ส่วนลด (฿)"
                      value={p.discount}
                      onChange={(e) => setPerson(i, { discount: e.target.value })}
                      onBlur={() => {
                        // เศษสตางค์ทำให้เบราว์เซอร์บล็อกปุ่มชำระ — ปัดเป็นบาทเต็ม
                        const n = Number(p.discount)
                        if (p.discount !== "" && Number.isFinite(n) && !Number.isInteger(n)) {
                          setPerson(i, { discount: String(Math.round(n)) })
                        }
                      }}
                      className="h-11"
                      aria-label={`ส่วนลดคนที่ ${i + 1}`}
                    />
                    <select
                      value={p.couponPromo}
                      onChange={(e) =>
                        setPerson(i, withPromoDiscount(p, { couponPromo: e.target.value }))
                      }
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

                  <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-slate-700">
                    <Checkbox
                      checked={p.isRequest}
                      onCheckedChange={(v) => setPerson(i, { isRequest: v === true })}
                      aria-label={`รีเควสหมอคนที่ ${i + 1}`}
                    />
                    รีเควสหมอ{" "}
                    <span className="text-slate-500">
                      (หมอได้ +{REQUEST_FEE} ฿ — ร้านจ่าย)
                    </span>
                  </label>

                  <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-slate-700">
                    <Checkbox
                      checked={p.privateRoom}
                      onCheckedChange={(v) => setPerson(i, { privateRoom: v === true })}
                      aria-label={`ห้องสปาคนที่ ${i + 1}`}
                    />
                    ห้องสปาส่วนตัว{" "}
                    <span className="text-slate-500">(+{PRIVATE_ROOM_FEE} ฿)</span>
                  </label>

                  {service && (
                    <p className="text-xs text-slate-500">
                      ราคาปกติ {formatBaht(service.price)} ฿
                      {p.isRequest ? ` · รีเควสหมอ (ร้านจ่าย +${REQUEST_FEE} ฿)` : ""}
                      {p.privateRoom ? ` · ห้องสปา +${PRIVATE_ROOM_FEE} ฿` : ""}
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

      {/* บิลชุด: ระบบเดาไม่ได้ว่า "กลุ่มครอบครัว" หรือ "คนเดียวหลายคอร์ส"
          เพราะคิวกลุ่มเก็บชื่อผู้ติดต่อคนเดียวลงทุกการ์ด — ให้พนักงานติ๊กเอง */}
      <div className="flex items-center gap-3 rounded-lg border border-emerald-200 p-3">
        <Checkbox
          id="merge_bill"
          checked={mergeBill}
          onCheckedChange={(v) => setMergeBill(v === true)}
        />
        <Label htmlFor="merge_bill" className="flex-1 cursor-pointer text-sm">
          🧾 รวมทุกรายการเป็นบิลชุดใบเดียว{" "}
          <span className="font-normal text-slate-500">
            (ลูกค้าคนเดียวกันทำหลายคอร์ส — ไม่ใช่กลุ่มหลายคน)
          </span>
        </Label>
      </div>

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
