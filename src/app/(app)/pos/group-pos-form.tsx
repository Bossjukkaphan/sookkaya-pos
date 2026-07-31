"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { createSale } from "../sale-actions"
import { CustomerPicker } from "./customer-picker"
import { createClient } from "@/lib/supabase/client"
import { allocateCredit } from "@/lib/bill"
import { MAX_PAYMENT_LINES, PAYMENT_LINE_METHODS, dueAmount, primaryMethod } from "@/lib/payments"
import {
  MEMBER_CREDIT_METHOD,
  PRIVATE_ROOM_FEE,
  REQUEST_FEE,
  formatBaht,
} from "@/lib/constants"
import {
  HAPPY_HOUR_KEY,
  happyHourDiscountBaht,
  promoDiscountBaht,
  promoKey,
} from "@/lib/promo"
import { Checkbox } from "@/components/ui/checkbox"
import { Time24Field } from "@/components/time24-field"
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
  // แบ่งชำระด้วยเครดิตสมาชิก — ใช้ได้เฉพาะบิลชุดลูกค้าคนเดียว (กลุ่มหลายคนเครดิตผูกรายบุคคล)
  const [creditBalance, setCreditBalance] = useState(0)
  // เริ่ม "0" เสมอ — ไม่ auto-fill เพดานเครดิตให้แล้ว (สเปก 2026-08-01) พนักงานต้องกดปุ่ม "ใช้เครดิต" เอง
  const [creditUseInput, setCreditUseInput] = useState("0")
  // แบ่งจ่ายหลายวิธี (เฉพาะบิลชุด mergeBill) — บรรทัดแรกคือปุ่มช่องทางหลักด้านล่าง ยอด = ที่เหลือหลังหักบรรทัดเสริม
  const [extraPayments, setExtraPayments] = useState<{ method: string; amount: string }[]>([])
  // ยอดบรรทัดหลัก: null = auto (ยอดที่เหลือเป๊ะ) · พนักงานพิมพ์เอง = ตั้งใจรับน้อยกว่า (ค้างรับ)
  const [primaryInput, setPrimaryInput] = useState<string | null>(null)

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

  // บิลชุดของลูกค้าคนเดียว = ทุกแถวผูก customer เดียวกันและไม่ว่าง — เงื่อนไขเดียวที่เครดิตใช้ได้
  // (คิวกลุ่มครอบครัวเก็บชื่อผู้ติดต่อคนเดียวลงทุกการ์ดก็จริง แต่ mergeBill คือคำยืนยันจากพนักงาน)
  const billCustomerId =
    mergeBill && people.length > 0 && people[0].customerId &&
    people.every((p) => p.customerId === people[0].customerId)
      ? people[0].customerId
      : ""

  // ยอดเครดิตของลูกค้าบิลชุด — ดึงแบบเดียวกับ CustomerPicker (ฟอร์มนี้โหมดคิวไม่มี picker ให้พึ่ง)
  useEffect(() => {
    if (!billCustomerId) return
    let cancelled = false
    ;(async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from("member_balances")
        .select("credit_balance")
        .eq("customer_id", billCustomerId)
        .single()
      if (!cancelled) setCreditBalance(Number(data?.credit_balance ?? 0))
    })()
    return () => {
      cancelled = true
    }
  }, [billCustomerId])

  const canUseCredit = Boolean(billCustomerId) && creditBalance > 0
  const creditCap = Math.min(creditBalance, total)
  const creditUse = canUseCredit
    ? Math.min(Math.max(0, Number(creditUseInput) || 0), creditCap)
    : 0
  const cashDue = Math.round((total - creditUse) * 100) / 100
  // เครดิตพอทั้งบิล → ช่องทางเป็น Member Credit อัตโนมัติ ไม่ต้องเลือกปุ่มเงินจริง
  const fullCredit = canUseCredit && creditUse > 0 && cashDue === 0
  const effectivePaymentMethod = fullCredit ? MEMBER_CREDIT_METHOD : paymentMethod

  // บิลชุด (mergeBill + ลูกค้าเดียว + มากกว่า 1 รายการ — ตรงเงื่อนไขเดียวกับที่ submitAll สร้าง bill_id จริง)
  // แบ่งจ่ายหลายวิธีได้เหมือนฟอร์มเดี่ยว — บรรทัดแรกคือปุ่มช่องทางหลัก ยอด = ที่เหลือหลังหักบรรทัดเสริม
  const isBillChud = mergeBill && people.length > 1
  const extraTotal = extraPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
  const primaryRemainder = Math.max(0, Math.round((cashDue - extraTotal) * 100) / 100)
  // primaryInput = null → ใช้ยอดที่เหลือเป๊ะ · พนักงานพิมพ์เอง → รับได้น้อยกว่ายอดที่เหลือ (ตั้งใจปล่อยค้างรับ)
  // แต่พิมพ์เกินยอดที่เหลือไม่ได้ (หนีบไว้ที่ primaryRemainder กันเก็บเกิน)
  const primaryAmount =
    primaryInput === null
      ? primaryRemainder
      : Math.min(primaryRemainder, Math.max(0, Number(primaryInput) || 0))

  // บรรทัดชำระของบิลชุด — undefined = ไม่ track (ไม่ใช่บิลชุด หรือเครดิตครอบคลุมทั้งบิลแล้ว ไม่มีเงินจริงให้ track)
  const mergeBillPaymentLines: { method: string; amount: number }[] | undefined =
    isBillChud && !fullCredit
      ? [
          { method: effectivePaymentMethod, amount: primaryAmount },
          ...extraPayments.map((p) => ({ method: p.method, amount: Number(p.amount) || 0 })),
        ].filter((l) => l.amount > 0)
      : undefined

  // ค้างรับ ณ ตอนนี้ของบิลชุด (พนักงานลบ/ลดบรรทัดจนรวม < ต้องเก็บ) — โชว์สดในฟอร์ม + เช็คก่อน submit
  const dueNow = mergeBillPaymentLines ? dueAmount(cashDue, mergeBillPaymentLines) : 0

  // F1: server เขียน payment_method ของ "แถวแรก" ของบิลชุดเป็น primaryMethod(lines) เสมอ (sale-actions.ts
  // linePrimary) แต่แถวที่ 2 เป็นต้นไปส่ง payments="[]" จึงไม่มีบรรทัดให้ derive และ fallback ไปใช้ค่าดิบที่
  // ส่งมา — ถ้าปุ่มที่กดไม่ตรงกับ "วิธีที่ยอดสูงสุด" ในบรรทัดแบ่งจ่าย (เช่น กดเงินสดแต่บรรทัดเสริมบัตรเครดิต
  // ยอดสูงกว่า) แถวแรกกับแถวอื่นจะได้ payment_method คนละค่า → recon FAIL ต้องส่งค่าเดียวกับที่ server จะ
  // เขียนที่แถวแรกไว้ล่วงหน้าให้ทุกแถวของบิลชุด
  const submittedPaymentMethod = mergeBillPaymentLines
    ? primaryMethod(mergeBillPaymentLines) ?? effectivePaymentMethod
    : effectivePaymentMethod

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
    if (!effectivePaymentMethod) {
      toast.error("เลือกช่องทางชำระเงินก่อน")
      return
    }
    // F2: บิลชุด (billId) เพดาน server เป็น Infinity โดยตั้งใจ (ดูคอมเมนต์ mustCollect ใน sale-actions.ts)
    // เพราะแถวแรกยังไม่รู้ยอดรวมของรายการเสริมที่ยังไม่ insert — ฝั่ง client จึงต้องกันเก็บเกินเอง ก่อนยิง network
    if (dueNow < -0.005) {
      toast.error("ยอดรับรวมเกินยอดบิล — ตรวจบรรทัดแบ่งจ่าย")
      return
    }
    // บิลชุดค้างรับ > 0 (พนักงานลบ/ลดบรรทัดจนรวมไม่ครบ) — ยืนยันก่อนบันทึกว่าตั้งใจปล่อยค้าง
    if (
      isBillChud &&
      dueNow > 0 &&
      !window.confirm(`บันทึกแบบค้างรับ ${dueNow} ฿? ลูกค้าจะจ่ายส่วนนี้ทีหลัง`)
    ) {
      return
    }
    // บิลชุด: พนักงานติ๊กเองว่าเป็นลูกค้าคนเดียวทำหลายคอร์ส — เดาจากข้อมูลไม่ได้
    // เพราะคิวกลุ่ม (ครอบครัว) ก็เก็บชื่อผู้ติดต่อคนเดียวลงทุกการ์ดเหมือนกัน
    const billId = isBillChud ? crypto.randomUUID() : ""
    // แบ่งชำระบิลชุด: เฉลี่ยเครดิตลงแต่ละรายการตามสัดส่วน (ที่เดียวกับฟอร์มเดี่ยว)
    // เครดิตเต็มบิล → ช่องทาง Member Credit ตัดเต็มรายแถวเอง ไม่ต้องส่ง allocation
    const perItemCredit = allocateCredit(nets, fullCredit ? 0 : creditUse)
    const receipts: string[] = []
    for (let i = 0; i < people.length; i++) {
      const p = people[i]
      setSavingIndex(i)
      const fd = new FormData()
      fd.set("therapist_id", p.therapistId)
      fd.set("service_id", p.serviceId)
      fd.set("payment_method", submittedPaymentMethod)
      if (perItemCredit[i] > 0) fd.set("credit_requested", String(perItemCredit[i]))
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

      if (billId) {
        // บิลชุด: บรรทัดชำระของทั้งบิลเขียนครั้งเดียวที่แถวแรก (ดู sale-actions.ts) —
        // แถวถัดไปส่ง "[]" ไม่ใช่บรรทัดจริง แต่ยัง track (payments_tracked=true) เหมือนกันทุกแถว
        if (mergeBillPaymentLines) {
          fd.set("payments", i === 0 ? JSON.stringify(mergeBillPaymentLines) : "[]")
        }
      } else {
        // กลุ่มหลายคน (คนละบิล จ่ายรวมครั้งเดียว): บิลของแต่ละคน track บรรทัดเดียวของตัวเอง
        // = ยอดที่ต้องเก็บของบิลนั้นเป๊ะ (ปกติไม่มีเครดิตปน — เครดิตกลุ่มใช้ได้เฉพาะบิลชุด mergeBill เท่านั้น)
        //
        // F7: กรณี 1 คน + mergeBill + เครดิตครอบคลุมทั้งบิล (fullCredit) — isBillChud ยังเป็น false เพราะ
        // ต้องมากกว่า 1 คน จึงหลุดมาเข้า branch นี้ทั้งที่ effectivePaymentMethod คือ "Member Credit" (ไม่ใช่
        // ช่องทางเงินจริงตาม PAYMENT_LINE_METHODS) ถ้าส่ง payments ออกไป parsePaymentLines จะปฏิเสธค่านี้ทันที
        // → save hard-fail เพิ่ม !fullCredit กันไว้ — เครดิตเต็มบิลไม่มีเงินจริงให้ track เลย server เดินทาง
        // MEMBER_CREDIT_METHOD หักเครดิตเต็มยอดของแถวนั้นเอง (เหมือนที่ pos-form.tsx ปฏิบัติกับ fullCredit)
        const due = Math.round((nets[i] - perItemCredit[i]) * 100) / 100
        if (due > 0 && !fullCredit)
          fd.set("payments", JSON.stringify([{ method: effectivePaymentMethod, amount: due }]))
      }

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
      if (r.warning) toast.warning(r.warning)
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
                    {/* dropdown 24 ชม. — จุดสุดท้ายที่ยังเป็น input type=time (AM/PM หลอกตา) */}
                    <Time24Field
                      value={p.serviceTime}
                      onChange={(v) => setPerson(i, { serviceTime: v })}
                      startHour={10}
                      endHour={23}
                      ariaLabel={`เวลาใช้บริการคนที่ ${i + 1}`}
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
          onCheckedChange={(v) => {
            setMergeBill(v === true)
            // สลับโหมด → เลิกใช้ตัวเลขบรรทัดชำระที่แก้เองไว้ก่อนหน้า กันเลขค้างซากข้ามโหมด
            setExtraPayments([])
            setPrimaryInput(null)
          }}
        />
        <Label htmlFor="merge_bill" className="flex-1 cursor-pointer text-sm">
          🧾 รวมทุกรายการเป็นบิลชุดใบเดียว{" "}
          <span className="font-normal text-slate-500">
            (ลูกค้าคนเดียวกันทำหลายคอร์ส — ไม่ใช่กลุ่มหลายคน)
          </span>
        </Label>
      </div>

      {/* แบ่งชำระ: เครดิตสมาชิกใช้ได้เฉพาะบิลชุดลูกค้าคนเดียว — แบบเดียวกับฟอร์มขายเดี่ยว */}
      {canUseCredit && (
        <div className="space-y-1 rounded-lg border bg-amber-50/50 p-3">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="group_credit_use">
              ใช้เครดิตสมาชิก{" "}
              <span className="font-normal text-slate-500">
                (มี {formatBaht(creditBalance)} ฿)
              </span>
            </Label>
            <Input
              id="group_credit_use"
              inputMode="numeric"
              className="h-10 w-28 text-right"
              value={creditUseInput}
              onChange={(e) => {
                setCreditUseInput(e.target.value)
                // เครดิตเปลี่ยน → cashDue เปลี่ยน เลิกใช้ตัวเลขบรรทัดหลักที่แก้เองไว้ก่อนหน้า กลับไป auto
                setPrimaryInput(null)
              }}
            />
          </div>
          {/* เริ่มที่ "0" เสมอ — ปุ่มนี้กดแล้วค่อยเติมเพดานให้ (สเปก 2026-08-01 เลิก auto-fill) */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setCreditUseInput(String(creditCap))
              setPrimaryInput(null)
            }}
          >
            ใช้เครดิต (เหลือ {formatBaht(creditBalance)} ฿)
          </Button>
          <p className="text-sm font-medium">
            {cashDue > 0 ? (
              <>
                เครดิต {formatBaht(creditUse)} · ต้องเก็บเพิ่ม{" "}
                <span className="text-red-600">{formatBaht(cashDue)} ฿</span>
              </>
            ) : creditUse > 0 ? (
              <>เครดิตครอบคลุมทั้งบิล — ช่องทางชำระเป็น Member Credit อัตโนมัติ</>
            ) : null}
          </p>
        </div>
      )}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">
          ช่องทางชำระเงิน <span className="font-normal text-slate-500">(จ่ายรวมครั้งเดียวทั้งกลุ่ม)</span>
        </legend>
        <div className="grid grid-cols-3 gap-2">
          {PAYMENT_LINE_METHODS.map((m) => (
            <Button
              key={m}
              type="button"
              variant="outline"
              // เครดิตพอทั้งบิลแล้ว — ไม่มีเงินจริงต้องเก็บ ปุ่มช่องทางไม่ต้องกด
              disabled={fullCredit}
              className={
                effectivePaymentMethod === m
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
          {canUseCredit
            ? "เครดิตถูกหักตามช่องด้านบน — เลือกช่องทางสำหรับส่วนที่เก็บเพิ่ม"
            : 'เครดิตสมาชิกใช้ได้เมื่อติ๊ก "บิลชุดใบเดียว" ของลูกค้าคนเดียวกัน · Gowabi / KOL — กด "เก็บเงิน" รายคนจากการ์ดคิวแทน (ต้องกรอกรหัสจองรายคน)'}
        </p>
      </fieldset>

      {/* แบ่งจ่ายหลายวิธีในบิลเดียว — เฉพาะบิลชุด (mergeBill คนเดียวกัน) เพราะกลุ่มหลายคนได้บรรทัดเดียว
          ต่อบิลของตัวเองอัตโนมัติอยู่แล้ว (ดู submitAll) ไม่ต้องมี UI แยก */}
      {isBillChud && !fullCredit && (
        <div className="space-y-2 rounded-lg border p-3">
          <p className="text-sm font-medium">แบ่งจ่ายหลายวิธี (ไม่บังคับ)</p>
          {extraPayments.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <select
                value={p.method}
                aria-label={`วิธีชำระบรรทัดที่ ${i + 2}`}
                className="h-10 flex-1 rounded-md border border-input bg-transparent px-2 text-sm outline-none"
                onChange={(e) =>
                  setExtraPayments((a) =>
                    a.map((x, j) => (j === i ? { ...x, method: e.target.value } : x))
                  )
                }
              >
                {PAYMENT_LINE_METHODS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
              <Input
                inputMode="numeric"
                className="h-10 w-28 text-right"
                aria-label={`ยอดบรรทัดที่ ${i + 2}`}
                value={p.amount}
                onChange={(e) =>
                  setExtraPayments((a) =>
                    a.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x))
                  )
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-red-600"
                onClick={() => setExtraPayments((a) => a.filter((_, j) => j !== i))}
              >
                ✕
              </Button>
            </div>
          ))}
          {extraPayments.length < MAX_PAYMENT_LINES - 1 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setExtraPayments((a) => [...a, { method: "QR Code", amount: "" }])}
            >
              + แบ่งจ่ายอีกวิธี
            </Button>
          )}
          {/* บรรทัดหลัก — ปกติเป็นยอดที่เหลือ auto พิมพ์เองได้ถ้าตั้งใจรับน้อยกว่า (ค้างรับ) พิมพ์เกินยอดที่เหลือไม่ได้ (หนีบ) */}
          <div className="flex items-center gap-2">
            <span className="flex-1 text-sm font-medium">{effectivePaymentMethod || "—"}</span>
            <Input
              inputMode="numeric"
              className="h-10 w-28 text-right"
              aria-label="ยอดบรรทัดหลัก"
              value={primaryInput ?? String(primaryRemainder)}
              onChange={(e) => setPrimaryInput(e.target.value)}
              onBlur={() => {
                if (primaryInput === null) return
                setPrimaryInput(String(primaryAmount))
              }}
            />
          </div>
          <p className="text-sm">
            {extraPayments
              .filter((p) => Number(p.amount) > 0)
              .map((p) => `+ ${p.method} ${formatBaht(Number(p.amount))} ฿`)
              .join(" ")}
            {dueNow > 0 && (
              <span className="ml-1 font-medium text-red-600">
                · ค้างรับ {formatBaht(dueNow)} ฿
              </span>
            )}
          </p>
        </div>
      )}

      <div className="rounded-xl border-2 border-emerald-500 bg-emerald-50 px-4 py-3">
        <div className="flex items-baseline justify-between">
          <span className="font-semibold">รวมทั้งกลุ่ม ({people.length} คน)</span>
          <span className="text-2xl font-extrabold text-emerald-800">
            {formatBaht(total)} ฿
          </span>
        </div>
        {creditUse > 0 && (
          <div className="mt-1 flex items-baseline justify-between border-t border-emerald-200 pt-1 text-sm">
            <span className="text-slate-600">เครดิตสมาชิก {formatBaht(creditUse)} ฿</span>
            <span className="font-semibold">
              {cashDue > 0 ? `เก็บเงินจริง ${formatBaht(cashDue)} ฿` : "ไม่ต้องเก็บเงินเพิ่ม"}
            </span>
          </div>
        )}
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
          : `บันทึก ${people.length} บิล — รับเงิน ${formatBaht(cashDue)} ฿${
              creditUse > 0 ? ` + เครดิต ${formatBaht(creditUse)} ฿` : ""
            }`}
      </Button>
      {people.some((p) => !p.therapistId || !p.serviceId) && (
        <p className="text-center text-xs text-amber-700">
          เลือกหมอนวดและเมนูให้ครบทุกคนก่อนบันทึก
        </p>
      )}
    </div>
  )
}
