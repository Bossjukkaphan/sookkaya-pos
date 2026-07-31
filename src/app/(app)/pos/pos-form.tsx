"use client"

import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"

import { checkPointCoupon, createSale, type CouponCheck } from "../sale-actions"
import { CustomerPicker } from "./customer-picker"
import { allocateCredit } from "@/lib/bill"
import { MAX_PAYMENT_LINES, PAYMENT_LINE_METHODS, dueAmount, primaryMethod } from "@/lib/payments"
import {
  GOWABI_METHOD,
  MEMBER_CREDIT_METHOD,
  PAYMENT_METHODS,
  PRIVATE_ROOM_FEE, REQUEST_FEE,
  formatBaht,
} from "@/lib/constants"
import {
  BOOKING_CHANNELS,
  CHANNEL_LABEL,
  CUSTOMER_SOURCES,
  SOURCE_LABEL,
  isBookingChannel,
  isCustomerSource,
  type BookingChannel,
  type CustomerSource,
} from "@/lib/customer-source"
import {
  PAY_DOT,
  PAY_DOT_DEFAULT,
  PAY_SELECTED,
  PAY_SELECTED_DEFAULT,
} from "@/lib/payment-colors"
import { nowTimeInShopTz } from "@/lib/datetime"
import {
  HAPPY_HOUR_KEY,
  happyHourDiscountBaht,
  promoDiscountBaht,
  promoKey,
} from "@/lib/promo"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Time24Field } from "@/components/time24-field"
import { Card, CardContent } from "@/components/ui/card"
import { ServiceCombobox } from "@/components/service-combobox"

type Therapist = { id: string; name: string }
type Service = { id: string; name: string; price: number; commission: number }
type Promotion = { id: string; name: string; discount_pct: number | null }
type Bed = { id: string; room: string; name: string }

/** รายการเพิ่มเติมในบิลชุด — ลูกค้า/เวลา/วิธีจ่ายใช้ร่วมกับรายการหลัก */
type ExtraItem = {
  serviceId: string
  therapistId: string
  couponPromo: string
  discount: string
  isRequest: boolean
  privateRoom: boolean
}

const BLANK_EXTRA: ExtraItem = {
  serviceId: "",
  therapistId: "",
  couponPromo: "",
  discount: "",
  isRequest: false,
  privateRoom: false,
}

/** ค่ากรอกล่วงหน้าจากการ์ดคิว — เก็บเงินจากบอร์ดคิวไม่ต้องกรอกซ้ำ */
export type PosInitial = {
  queueEntryId: string
  therapistId: string
  serviceId: string
  customerId: string
  customerName: string
  customerPhone: string
  source: string
  bedId: string
  bookingChannel: string
  notes: string
  /** เวลาเริ่มนวดจริงจากคิว (HH:MM) — บิลมักถูกคีย์หลังนวดเสร็จ เวลากดบันทึกไม่ใช่เวลาใช้บริการ */
  serviceTime: string
  /** รีเควสหมอที่ติ๊กไว้ตั้งแต่ตอนจองคิว — ติ๊กให้เลย +40 อัตโนมัติ */
  isRequest: boolean
  /** ห้องสปาส่วนตัวจากคิว — ติ๊กให้เลย +100 (ลูกค้าจ่าย) */
  privateRoom: boolean
}

export function PosForm({
  therapists,
  services,
  promotions,
  beds,
  initial,
}: {
  therapists: Therapist[]
  services: Service[]
  promotions: Promotion[]
  beds: Bed[]
  initial?: PosInitial
}) {
  const [therapistId, setTherapistId] = useState(initial?.therapistId ?? "")
  const [serviceId, setServiceId] = useState(initial?.serviceId ?? "")
  const [paymentMethod, setPaymentMethod] = useState("")
  const [discount, setDiscount] = useState("")
  const [gowabiNet, setGowabiNet] = useState("")
  // มาจากคิวที่ติ๊กรีเควสไว้ → ติ๊กให้เลย ไม่ต้องจำมากรอกซ้ำ
  const [isRequest, setIsRequest] = useState(initial?.isRequest ?? false)
  const [privateRoom, setPrivateRoom] = useState(initial?.privateRoom ?? false)
  const [customerId, setCustomerId] = useState(initial?.customerId ?? "")
  const [customerName, setCustomerName] = useState(initial?.customerName ?? "")
  const [customerPhone, setCustomerPhone] = useState(initial?.customerPhone ?? "")
  const [source, setSource] = useState<CustomerSource>(
    initial && isCustomerSource(initial.source) ? initial.source : "walk_in"
  )
  const [bookingChannel, setBookingChannel] = useState<BookingChannel | "">(
    initial && isBookingChannel(initial.bookingChannel) ? initial.bookingChannel : ""
  )
  const [bedId, setBedId] = useState(initial?.bedId ?? "")
  const [notes, setNotes] = useState(initial?.notes ?? "")
  // เวลาใช้บริการ ≠ เวลาบันทึก — บิลมักถูกคีย์หลังนวดเสร็จ จึงให้แก้ได้
  // ค่าเริ่มต้น: มาจากคิวใช้เวลาเริ่มนวดจริง · ไม่ผ่านคิวใช้เวลาปัจจุบัน
  // (เวลาบันทึกระบบประทับให้เองที่ created_at ไม่ต้องกรอก)
  const [serviceTime, setServiceTime] = useState(
    initial?.serviceTime || nowTimeInShopTz()
  )
  const [couponPromo, setCouponPromo] = useState("")
  // Gowabi ต้องพิมพ์รหัสจองเป็นเลขเสมอ จึงบังคับเป็นช่องพิมพ์
  // กรณีอื่นเริ่มจาก dropdown แล้วเปิดช่องพิมพ์เฉพาะเมื่อเลือก "อื่นๆ"
  const [customPromo, setCustomPromo] = useState(false)
  // บิลชุด: รายการที่ 2 เป็นต้นไปของลูกค้าคนเดียวกัน (จ่ายรวมครั้งเดียว)
  const [extras, setExtras] = useState<ExtraItem[]>([])
  // คูปองแลกแต้มจากไลน์ — ตรวจแล้วเติมลูกค้า/เมนู/ส่วนลดเต็มราคาให้อัตโนมัติ
  const [couponCode, setCouponCode] = useState("")
  const [couponInfo, setCouponInfo] = useState<(CouponCheck & { ok: true }) | null>(null)
  const [checkingCoupon, setCheckingCoupon] = useState(false)
  // แบ่งชำระ: เครดิตสมาชิกของลูกค้าที่เลือก (มาจาก CustomerPicker) + ค่าที่พนักงานแก้เอง
  const [creditBalance, setCreditBalance] = useState(0)
  // เริ่ม "0" เสมอ — ไม่ auto-fill เพดานเครดิตให้แล้ว (สเปก 2026-08-01) พนักงานต้องกดปุ่ม "ใช้เครดิต" เอง
  const [creditUseInput, setCreditUseInput] = useState("0")
  // บรรทัดแบ่งจ่ายเพิ่มเติม (บรรทัดแรกคือปุ่มช่องทางหลักเดิม ยอด = ที่เหลือหลังหักบรรทัดเสริม)
  const [extraPayments, setExtraPayments] = useState<{ method: string; amount: string }[]>([])
  // ยอดบรรทัดหลัก: null = auto (ยอดที่เหลือเป๊ะ) · พนักงานพิมพ์เอง = ตั้งใจรับน้อยกว่า (ค้างรับ) — หนีบไม่ให้เกินยอดที่เหลือ
  // รีเซ็ตกลับ auto ทุกครั้งที่ฐานคำนวณ (ลูกค้า/เมนู/เครดิต) เปลี่ยน กันเลขค้างซากจากบิลก่อนหน้า
  const [primaryInput, setPrimaryInput] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const service = useMemo(
    () => services.find((s) => s.id === serviceId),
    [services, serviceId]
  )

  const isGowabi = paymentMethod === GOWABI_METHOD

  // เลือกโปรที่ตั้ง % หรือ Happy Hour → คืนส่วนลดเป็นบาทเต็ม (null = ไม่ต้องแตะช่อง)
  // ใช้ร่วมกันทั้งรายการหลักและรายการเพิ่มเติม
  function computedPromoDiscount(promoName: string, svcId: string): string | null {
    const svc = services.find((s) => s.id === svcId)
    const promo = promotions.find((p) => p.name === promoName)
    if (!svc || !promo) return null
    // Happy Hour: เมนูนวด 90 นาที จ่ายราคา 60 — ส่วนลดคือส่วนต่างของสองราคา
    if (promoKey(promo.name) === HAPPY_HOUR_KEY) {
      const hh = happyHourDiscountBaht(svc, services)
      if (hh != null) {
        toast.info(`Happy Hour: จ่ายราคา 60 นาที (ลด ${hh} ฿) · ใช้ จ–ศ ก่อน 12:00`)
        return String(hh)
      }
      toast.warning("เมนูนี้ไม่เข้าเงื่อนไข Happy Hour — ต้องเป็นเมนูนวด 90 นาที (ทรีตเมนต์/คอบ่าไหล่ไม่ร่วม)")
      return null
    }
    if (promo.discount_pct) return String(promoDiscountBaht(svc.price, promo.discount_pct))
    return null
  }

  function applyPromoDiscount(promoName: string, svcId: string) {
    if (customPromo) return
    const d = computedPromoDiscount(promoName, svcId)
    if (d != null) setDiscount(d)
  }

  function setExtra(i: number, patch: Partial<ExtraItem>) {
    setExtras((arr) => arr.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  }

  async function applyCoupon() {
    setCheckingCoupon(true)
    const r = await checkPointCoupon(couponCode)
    if (!r.ok) {
      toast.error(r.error)
      setCheckingCoupon(false)
      return
    }
    setCouponInfo(r)
    setCustomerId(r.customerId)
    setCustomerName(r.customerName)
    setCustomerPhone(r.customerPhone)
    setCustomPromo(true)
    setCouponPromo("แลกแต้ม")
    const svcId = r.serviceId ?? serviceId
    if (r.serviceId) setServiceId(r.serviceId)
    const svc = services.find((s) => s.id === svcId)
    if (svc) setDiscount(String(svc.price))
    toast.success(
      `คูปอง ${r.rewardName} ของ ${r.customerName || "ลูกค้า"} — บิลนี้เก็บ 0 บาท` +
        (r.serviceId ? "" : " (เลือกเมนูแล้วส่วนลดจะเต็มราคาให้เอง)")
    )
    setCheckingCoupon(false)
  }

  function clearCoupon() {
    setCouponInfo(null)
    setCouponCode("")
    setCouponPromo("")
    setCustomPromo(false)
    setDiscount("")
  }

  function extraNet(x: ExtraItem): number {
    const svc = services.find((s) => s.id === x.serviceId)
    if (!svc) return 0
    return (
      Math.max(0, svc.price - (Number(x.discount) || 0)) +
      (x.privateRoom ? PRIVATE_ROOM_FEE : 0)
    )
  }

  const netAmount = useMemo(() => {
    if (!service) return 0
    // ค่าห้องสปาลูกค้าจ่ายจริง บวกทับทุกวิธีจ่าย (สูตรเดียวกับ server)
    const room = privateRoom ? PRIVATE_ROOM_FEE : 0
    if (isGowabi) return Math.max(0, Number(gowabiNet) || 0) + room
    return Math.max(0, service.price - (Number(discount) || 0)) + room
  }, [service, discount, gowabiNet, isGowabi, privateRoom])

  const isKol = paymentMethod === "KOL"

  // ยอดบิลรวมทั้งหมด (รายการหลัก + รายการเพิ่มเติม) — เพดานเครดิตและฐานคำนวณ "ต้องเก็บเพิ่ม"
  // (สูตรเดียวกับที่การ์ดสรุปยอดด้านล่างใช้โชว์)
  const billTotalNet = netAmount + extras.reduce((s, x) => s + extraNet(x), 0)

  // ช่องใช้เครดิตสมาชิกแบ่งชำระ — โชว์เฉพาะเลือกลูกค้าแล้ว + มีเครดิต + ไม่ใช่ Gowabi/KOL
  // + ไม่ใช่บิลคูปองแลกแต้ม (บิลนั้นเก็บ 0 บาทอยู่แล้ว ไม่มีอะไรให้แบ่ง)
  const canUseCredit =
    Boolean(customerId) && creditBalance > 0 && !isGowabi && !isKol && !couponInfo
  const creditCap = Math.min(creditBalance, billTotalNet)
  const creditUse = canUseCredit
    ? Math.min(Math.max(0, Number(creditUseInput) || 0), creditCap)
    : 0
  const cashDue = Math.round((billTotalNet - creditUse) * 100) / 100

  // แบ่งจ่ายหลายวิธี: บรรทัดแรก (ปุ่มช่องทางหลัก) ปกติกินยอดที่เหลือหลังหักบรรทัดเสริมทั้งหมดอัตโนมัติ
  const extraTotal = extraPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
  const primaryRemainder = Math.max(0, Math.round((cashDue - extraTotal) * 100) / 100)
  // primaryInput = null → ใช้ยอดที่เหลือเป๊ะ (พฤติกรรมเดิม) · พนักงานพิมพ์เอง → รับได้น้อยกว่ายอดที่เหลือ
  // (ตั้งใจปล่อยค้างรับ) แต่พิมพ์เกินยอดที่เหลือไม่ได้ (หนีบไว้ที่ primaryRemainder กันเก็บเกิน)
  const primaryAmount =
    primaryInput === null
      ? primaryRemainder
      : Math.min(primaryRemainder, Math.max(0, Number(primaryInput) || 0))

  // เครดิตใช้บางส่วนแล้วยังไม่ครบบิล — ต้องเก็บเงินจริงส่วนที่เหลือ ช่องทางที่ตัดเครดิตซ้ำ
  // (Member Credit) หรือรับเงินไม่ตรงจากลูกค้า (Gowabi/KOL) เลือกไม่ได้ตอนนี้ (server ก็ปฏิเสธเหมือนกัน)
  const partialCreditActive = canUseCredit && creditUse > 0 && cashDue > 0

  // เครดิตครอบคลุมทั้งบิลพอดี → ช่องทางที่ "จริงๆ" ใช้ต้องเป็น Member Credit เสมอ (บังคับ ไม่ใช่แค่ default)
  // คำนวณระหว่าง render แทนการ setState ใน effect กัน setPaymentMethod ชนของที่ผู้ใช้กดเอง
  // ไม่งั้นบิลจะถูกบันทึกเป็นช่องทางที่ผิด (เช่น "QR Code" ทั้งที่เงินจริงมาจากเครดิตล้วน)
  //
  // กรณีตรงข้าม: paymentMethod ค้างเป็น Member Credit อยู่ (เคยเลือกไว้ตอนเครดิตพอ) แต่ตอนนี้เครดิตที่ใช้ได้
  // ไม่พอบิลแล้ว (partialCreditActive) — ต้อง "หลุด" การเลือกทันที ไม่งั้นปุ่มจะค้างเป็น selected-but-disabled
  // พร้อมให้กดส่งได้ทั้งที่ server จะปฏิเสธด้วยข้อความเดิม ("เครดิตคงเหลือไม่พอ") ที่ฟีเจอร์แบ่งชำระนี้ตั้งใจกำจัดทิ้ง
  const mcSelectionBlocked = paymentMethod === MEMBER_CREDIT_METHOD && partialCreditActive
  const isMemberCredit =
    !mcSelectionBlocked &&
    (paymentMethod === MEMBER_CREDIT_METHOD || (canUseCredit && creditUse > 0 && cashDue === 0))
  const effectivePaymentMethod = mcSelectionBlocked
    ? ""
    : isMemberCredit
      ? MEMBER_CREDIT_METHOD
      : paymentMethod

  // เครดิตครอบคลุมทั้งบิล → ไม่มีเงินจริงให้ track เป็นบรรทัดชำระ (เหมือน Gowabi/KOL — server ก็ไม่รับ field payments)
  const fullCredit = isMemberCredit

  // บรรทัดชำระที่จะส่งจริง — undefined = ไม่ส่ง field "payments" เลย (Gowabi/KOL/เครดิตเต็มบิล คงพฤติกรรม
  // untracked เดิม) · บิลเงินจริงปกติส่งเสมอแม้บรรทัดเดียว เพื่อให้บิลนี้เข้า tracked (payments_tracked=true)
  const paymentLines: { method: string; amount: number }[] | undefined =
    isGowabi || isKol || fullCredit
      ? undefined
      : [
          { method: effectivePaymentMethod, amount: primaryAmount },
          ...extraPayments.map((p) => ({ method: p.method, amount: Number(p.amount) || 0 })),
        ].filter((l) => l.amount > 0)

  // ค้างรับ ณ ตอนนี้ (ถ้าพนักงานลบ/ลดบรรทัดจนรวม < ต้องเก็บ) — ใช้ทั้งโชว์สดในฟอร์มและเช็คก่อน submit
  const dueNow = paymentLines ? dueAmount(cashDue, paymentLines) : 0

  // F1: server เขียน payment_method ของ "แถวแรก" ของบิลชุดเป็น primaryMethod(lines) เสมอ (sale-actions.ts
  // linePrimary) แต่แถวที่ 2 เป็นต้นไปส่ง payments="[]" (ไม่มีบรรทัดให้ derive) จึง fallback ไปใช้ค่าดิบที่
  // ฟอร์มส่งมา — ถ้าปุ่มที่กดไม่ตรงกับ "วิธีที่ยอดสูงสุด" ในบรรทัดแบ่งจ่าย (เช่น กดเงินสดแต่บรรทัดเสริมบัตร
  // เครดิตยอดสูงกว่า) แถวแรกกับแถวอื่นจะได้ payment_method คนละค่า → recon FAIL (bill_overpaid/mismatch)
  // ต้องคำนวณค่าเดียวกับที่ server จะเขียนที่แถวแรกไว้ล่วงหน้า แล้วส่งค่านี้ให้ทุกแถวของบิลชุด
  const submittedPaymentMethod = paymentLines
    ? primaryMethod(paymentLines) ?? effectivePaymentMethod
    : effectivePaymentMethod

  function resetForm() {
    setTherapistId("")
    setServiceId("")
    setPaymentMethod("")
    setDiscount("")
    setGowabiNet("")
    setIsRequest(false)
    setPrivateRoom(false)
    setCustomerId("")
    setCustomerName("")
    setCustomerPhone("")
    setSource("walk_in")
    setBookingChannel("")
    setBedId("")
    setNotes("")
    setServiceTime(nowTimeInShopTz())
    setCouponPromo("")
    setCustomPromo(false)
    setExtras([])
    setCouponInfo(null)
    setCouponCode("")
    setCreditBalance(0)
    setCreditUseInput("0")
    setExtraPayments([])
    setPrimaryInput(null)
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)

    if (isGowabi && extras.length > 0) {
      toast.error("บิล Gowabi เพิ่มหลายรายการไม่ได้ — ลบรายการเพิ่มเติมก่อน")
      return
    }
    for (const [i, x] of extras.entries()) {
      if (!x.serviceId || !x.therapistId) {
        toast.error(
          `รายการที่ ${i + 2} ยังไม่ได้เลือก${!x.serviceId ? "เมนูบริการ" : "หมอนวด"}`
        )
        return
      }
    }

    // แบ่งชำระ: เฉลี่ยเครดิตลงแต่ละรายการตามสัดส่วนยอดสุทธิ (allocateCredit การันตีผลรวม = creditUse เป๊ะ)
    // Member Credit = เครดิตเต็มบิล ไม่ผ่านช่องแบ่งจ่ายนี้ — server หักเต็มบิลของมันเอง
    const nets = [netAmount, ...extras.map((x) => extraNet(x))]
    const perItemCredit = allocateCredit(nets, isMemberCredit ? 0 : creditUse)
    formData.set("credit_requested", String(perItemCredit[0]))

    // F2: บิลชุด (billId) เพดาน server เป็น Infinity โดยตั้งใจ (ดูคอมเมนต์ mustCollect ใน sale-actions.ts)
    // เพราะแถวแรกยังไม่รู้ยอดรวมของรายการเสริมที่ยังไม่ insert — ฝั่ง client จึงต้องกันเก็บเกินเอง ก่อนยิง network
    if (dueNow < -0.005) {
      toast.error("ยอดรับรวมเกินยอดบิล — ตรวจบรรทัดแบ่งจ่าย")
      return
    }

    // บิลเงินจริง (ไม่ใช่ Gowabi/KOL/เครดิตเต็มบิล) → ส่ง field "payments" เสมอ (แม้บรรทัดเดียว) ให้เข้า tracked
    if (paymentLines) formData.set("payments", JSON.stringify(paymentLines))

    // ค้างรับ > 0 (พนักงานลบ/ลดบรรทัดจนรวมไม่ครบ) — ยืนยันก่อนบันทึกว่าตั้งใจปล่อยค้าง
    // (โปรเจกต์นี้ยังไม่มี confirm dialog component กลาง — window.confirm พอสำหรับรอบแรก)
    if (dueNow > 0 && !window.confirm(`บันทึกแบบค้างรับ ${dueNow} ฿? ลูกค้าจะจ่ายส่วนนี้ทีหลัง`)) {
      return
    }

    startTransition(async () => {
      // บิลชุด: ทุกรายการแชร์ bill_id เดียว — สร้างฝั่ง client เพราะต้องใส่ตั้งแต่แถวแรก
      if (extras.length > 0) formData.set("bill_id", crypto.randomUUID())
      const result = await createSale(formData)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      if (result.warning) toast.warning(result.warning)

      let okCount = 1
      let creditAfter = result.creditAfter
      const failedItems: number[] = []
      for (const [i, x] of extras.entries()) {
        const fd = new FormData()
        // ข้อมูลร่วมของบิล (ลูกค้า/เวลา/วิธีจ่าย/ที่มา) ใช้ค่าเดียวกับรายการหลัก
        for (const key of [
          "bill_id",
          "sale_time",
          "customer_id",
          "customer_name",
          "customer_phone",
          "payment_method",
          "source",
          "booking_channel",
          "bed_id",
          "notes",
        ]) {
          const v = formData.get(key)
          if (v != null) fd.set(key, v)
        }
        fd.set("therapist_id", x.therapistId)
        fd.set("service_id", x.serviceId)
        fd.set("discount", x.discount || "0")
        fd.set("coupon_promo", x.couponPromo)
        fd.set("credit_requested", String(perItemCredit[i + 1]))
        if (x.isRequest) {
          fd.set("is_request", "on")
          fd.set("request_fee", String(REQUEST_FEE))
        }
        if (x.privateRoom) fd.set("private_room", "on")
        // บิลนี้ track บรรทัดชำระ (payments ถูกส่งที่รายการหลักแล้ว) — รายการเสริมต้อง tracked ด้วย
        // ไม่งั้น v_bill_due จะไม่นับ net_amount ของรายการนี้เข้ายอดบิล (query กรอง payments_tracked)
        // ส่ง "[]" ไม่ใช่บรรทัดจริง เพราะบรรทัดชำระของทั้งบิลถูกเขียนครั้งเดียวที่รายการแรกแล้ว (ดู sale-actions.ts)
        if (paymentLines) fd.set("payments", "[]")
        const r = await createSale(fd)
        if (r.ok) {
          okCount++
          if (r.creditAfter !== null) creditAfter = r.creditAfter
          if (r.warning) toast.warning(r.warning)
        } else {
          failedItems.push(i + 2)
          toast.error(`รายการที่ ${i + 2}: ${r.error}`)
        }
      }

      if (failedItems.length > 0) {
        // รายการหลักบันทึกไปแล้ว — ห้ามให้กดซ้ำทั้งฟอร์ม (จะได้บิลซ้อน)
        // แจ้งชัดว่าตัวไหนตกหล่น ให้คีย์เพิ่มเป็นบิลแยก
        toast.warning(
          `บันทึกได้ ${okCount} รายการ (ใบเสร็จ ${result.receiptNo}) · รายการที่ ${failedItems.join(", ")} ไม่สำเร็จ — กรุณาคีย์รายการนั้นใหม่แยกบิล`,
          { duration: 15000 }
        )
        resetForm()
        return
      }

      toast.success(
        (extras.length > 0
          ? `บันทึกบิลชุดแล้ว — ใบเสร็จ ${result.receiptNo} (${okCount} รายการ)`
          : `บันทึกแล้ว — ใบเสร็จ ${result.receiptNo}`) +
          (creditAfter !== null
            ? ` · เครดิตคงเหลือ ${formatBaht(creditAfter)} ฿`
            : ""),
        // มีเลขเครดิตให้พนักงานอ่านแจ้งลูกค้า — ค้างไว้นานกว่าปกติ
        creditAfter !== null ? { duration: 8000 } : undefined
      )
      resetForm()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 pb-4">
      {/* มาจากการ์ดคิว — บันทึกเสร็จ createSale จะปิดคิวเป็นชำระแล้ว */}
      {initial && (
        <input type="hidden" name="queue_entry_id" value={initial.queueEntryId} />
      )}
      {/* หมอนวด — ปุ่มกดเร็วกว่า dropdown */}
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">หมอนวด</legend>
        <input type="hidden" name="therapist_id" value={therapistId} />
        <div className="grid grid-cols-3 gap-2">
          {therapists.map((t) => (
            <Button
              key={t.id}
              type="button"
              variant={therapistId === t.id ? "default" : "outline"}
              className="h-12"
              onClick={() => setTherapistId(t.id)}
              aria-pressed={therapistId === t.id}
            >
              {t.name}
            </Button>
          ))}
        </div>
      </fieldset>

      {/* เมนูบริการ */}
      <div className="space-y-2">
        <Label htmlFor="service_id">เมนูบริการ</Label>
        <ServiceCombobox
          id="service_id"
          name="service_id"
          services={services}
          value={serviceId}
          onChange={(id) => {
            setServiceId(id)
            // เปลี่ยนเมนู → ยอดที่เหลือ (cashDue) เปลี่ยน เลิกใช้ตัวเลขบรรทัดหลักที่แก้เองของเมนูก่อน กลับไป auto
            setPrimaryInput(null)
            if (couponInfo) {
              // บิลแลกแต้ม: ส่วนลดต้องเต็มราคาเมนูที่เลือกเสมอ (เก็บ 0 บาท)
              const svc = services.find((s) => s.id === id)
              if (svc) setDiscount(String(svc.price))
            } else {
              applyPromoDiscount(couponPromo, id)
            }
          }}
        />
        {service && (
          <p className="text-sm text-slate-600">
            ราคาปกติ {formatBaht(service.price)} บาท · ค่ามือหมอ{" "}
            {formatBaht(service.commission)} บาท
          </p>
        )}
      </div>

      {/* เวลาใช้บริการ ≠ เวลาบันทึก — บิลมักถูกคีย์หลังนวดเสร็จ
          เวลาบันทึกระบบประทับให้เองเสมอ ช่องนี้คือเวลาที่ลูกค้าเริ่มใช้บริการจริง */}
      <div className="space-y-2">
        <Label>เวลาที่ใช้บริการ (24 ชม.)</Label>
        <input type="hidden" name="sale_time" value={serviceTime} />
        <Time24Field
          value={serviceTime}
          onChange={setServiceTime}
          startHour={10}
          endHour={23}
          ariaLabel="เวลาที่ใช้บริการ"
        />
        <p className="text-xs text-slate-500">
          {initial
            ? "ดึงเวลาเริ่มนวดจากคิวมาให้แล้ว แก้ได้ถ้าไม่ตรง"
            : "ปรับย้อนได้ถ้าคีย์บิลช้ากว่าเวลานวดจริง — เวลาบันทึกระบบเก็บให้อัตโนมัติ"}
        </p>
      </div>

      {/* ลูกค้า */}
      <CustomerPicker
        customerId={customerId}
        customerName={customerName}
        customerPhone={customerPhone}
        onPick={(c) => {
          setCustomerId(c.id)
          setCustomerName(c.name)
          setCustomerPhone(c.phone ?? "")
          // เปลี่ยนลูกค้า → เพดานเครดิต/ยอดที่เหลือเปลี่ยน เลิกใช้ตัวเลขที่แก้เองของลูกค้าคนก่อน กลับไป auto
          setCreditUseInput("0")
          setPrimaryInput(null)
        }}
        onNameChange={(name) => {
          setCustomerName(name)
          setCustomerId("")
          setCreditUseInput("0")
          setPrimaryInput(null)
        }}
        onPhoneChange={setCustomerPhone}
        onBalanceChange={setCreditBalance}
        requireMember={isMemberCredit}
      />

      {/* แบ่งชำระด้วยเครดิตสมาชิก — โชว์เฉพาะเลือกลูกค้าที่มีเครดิต + ไม่ใช่ Gowabi/KOL/คูปองแลกแต้ม */}
      {canUseCredit && (
        <div className="rounded-lg border bg-amber-50/50 p-3 space-y-1">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="credit_use">
              ใช้เครดิตสมาชิก (มี {creditBalance.toLocaleString()} บาท)
            </Label>
            <Input
              id="credit_use"
              inputMode="numeric"
              className="w-28 text-right"
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
                เครดิต {creditUse.toLocaleString()} · ต้องเก็บเพิ่ม{" "}
                <span className="text-red-600">{cashDue.toLocaleString()} บาท</span>
              </>
            ) : (
              <>เครดิตครอบคลุมทั้งบิล — ช่องทางชำระเป็น Member Credit อัตโนมัติ</>
            )}
          </p>
        </div>
      )}

      {/* ที่มาลูกค้า — metadata สำหรับวิเคราะห์ช่องทาง ไม่กระทบยอดเงิน */}
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">ลูกค้ามาจาก</legend>
        <input type="hidden" name="source" value={source} />
        <input type="hidden" name="booking_channel" value={bookingChannel} />
        <div className="grid grid-cols-3 gap-2">
          {CUSTOMER_SOURCES.map((s) => (
            <Button
              key={s}
              type="button"
              variant={source === s ? "default" : "outline"}
              className="h-10"
              onClick={() => {
                setSource(s)
                if (s !== "booking") setBookingChannel("")
              }}
              aria-pressed={source === s}
            >
              {SOURCE_LABEL[s]}
            </Button>
          ))}
        </div>
        {source === "booking" && (
          <div className="flex flex-wrap gap-1 pt-1">
            {BOOKING_CHANNELS.map((c) => (
              <Button
                key={c}
                type="button"
                size="sm"
                variant={bookingChannel === c ? "default" : "outline"}
                onClick={() => setBookingChannel(bookingChannel === c ? "" : c)}
              >
                {CHANNEL_LABEL[c]}
              </Button>
            ))}
          </div>
        )}
      </fieldset>

      {/* เตียง (ไม่บังคับ) */}
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">
          เตียง <span className="font-normal text-slate-500">(ไม่บังคับ)</span>
        </legend>
        <input type="hidden" name="bed_id" value={bedId} />
        {[...new Set(beds.map((b) => b.room))].map((room) => (
          <div key={room}>
            <p className="text-xs text-slate-500">{room}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {beds
                .filter((b) => b.room === room)
                .map((b) => (
                  <Button
                    key={b.id}
                    type="button"
                    size="sm"
                    variant={bedId === b.id ? "default" : "outline"}
                    onClick={() => setBedId(bedId === b.id ? "" : b.id)}
                  >
                    {b.name}
                  </Button>
                ))}
            </div>
          </div>
        ))}
      </fieldset>

      {/* ช่องทางชำระเงิน */}
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">ช่องทางชำระเงิน</legend>
        {/* F1: ส่งค่าที่ server จะเขียนจริงที่แถวแรกของบิลชุด (ดูคอมเมนต์ submittedPaymentMethod ด้านบน)
            แถวรายการเสริม (extras loop ด้านล่าง) copy field นี้จาก formData ตรงๆ จึงได้ค่าเดียวกันอัตโนมัติ */}
        <input type="hidden" name="payment_method" value={submittedPaymentMethod} />
        <div className="grid grid-cols-3 gap-2">
          {PAYMENT_METHODS.map((m) => (
            <Button
              key={m}
              type="button"
              variant="outline"
              // ตอนถูกเลือกใช้สีประจำช่องทาง (ชุดเดียวกับ badge ทุกหน้า) แทนดำล้วน
              // จะได้เห็นแวบเดียวว่ากดช่องทางไหนไป และจำสีไปอ่านหน้ารายงานต่อได้
              className={cn(
                "h-12 text-xs sm:text-sm",
                effectivePaymentMethod === m && (PAY_SELECTED[m] ?? PAY_SELECTED_DEFAULT)
              )}
              // แบ่งชำระเครดิตบางส่วนค้างอยู่ (เก็บเพิ่ม > 0) — เปลี่ยนไปช่องทางที่ตัดเครดิตซ้ำ
              // หรือรับเงินไม่ตรงจากลูกค้าไม่ได้ (server ก็ปฏิเสธเหมือนกัน) ต้องลดเครดิตเป็น 0 ก่อน
              disabled={
                partialCreditActive &&
                (m === MEMBER_CREDIT_METHOD || m === GOWABI_METHOD || m === "KOL")
              }
              onClick={() => {
                // ช่องนี้เปลี่ยนความหมายระหว่าง "รหัสจอง Gowabi" กับ "ชื่อโปรโมชั่น"
                // ถ้าไม่ล้างค่าเดิม ค่าที่ค้างจะถูกบันทึกข้ามประเภทกันโดยไม่มีอะไรเตือน
                if ((m === GOWABI_METHOD) !== isGowabi) {
                  setCouponPromo("")
                  setCustomPromo(false)
                }
                // Gowabi/KOL ใช้ร่วมกับเครดิตสมาชิกไม่ได้ (server ปฏิเสธ) — ล้างเครดิตที่กรอกไว้ทิ้ง
                // และเลิก track บรรทัดชำระ (server ไม่รับ field payments กับสองช่องทางนี้) — ล้างบรรทัดเสริมด้วย
                if (m === GOWABI_METHOD || m === "KOL") {
                  setCreditUseInput("0")
                  setExtraPayments([])
                  setPrimaryInput(null)
                }
                setPaymentMethod(m)
              }}
              aria-pressed={effectivePaymentMethod === m}
            >
              <span
                className={cn(
                  "mr-1 inline-block h-2 w-2 shrink-0 rounded-full",
                  effectivePaymentMethod === m ? "bg-white/80" : (PAY_DOT[m] ?? PAY_DOT_DEFAULT)
                )}
              />
              {m}
            </Button>
          ))}
        </div>
      </fieldset>

      {/* แบ่งจ่ายหลายวิธีในบิลเดียว — บรรทัดแรกคือปุ่มช่องทางข้างบน (ยอด = ที่เหลือหลังหักบรรทัดเสริม)
          ไม่โชว์กับ Gowabi/KOL/เครดิตเต็มบิล เพราะบิลพวกนี้ไม่ track บรรทัดชำระ (server ไม่รับ field payments) */}
      {!isGowabi && !isKol && !fullCredit && (
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
                // เศษสตางค์/พิมพ์เกินยอดที่เหลือ — ปัดให้ตรงกับยอดจริงที่จะถูกส่ง (เหมือน discount onBlur)
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

      {/* คูปองแลกแต้มจากไลน์ — ลูกค้าโชว์รหัส 6 ตัว */}
      <div className="space-y-2 rounded-lg border border-violet-200 p-3">
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <Label htmlFor="point_coupon">
              คูปองแลกแต้ม{" "}
              <span className="font-normal text-slate-500">(ถ้าลูกค้าโชว์รหัสจากไลน์)</span>
            </Label>
            <Input
              id="point_coupon"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
              maxLength={6}
              placeholder="รหัส 6 ตัว"
              className="h-11 uppercase tracking-widest"
              disabled={!!couponInfo}
            />
          </div>
          {couponInfo ? (
            <Button type="button" variant="outline" className="h-11" onClick={clearCoupon}>
              ยกเลิกคูปอง
            </Button>
          ) : (
            <Button
              type="button"
              className="h-11"
              onClick={applyCoupon}
              disabled={checkingCoupon || couponCode.trim().length !== 6}
            >
              {checkingCoupon ? "กำลังตรวจ..." : "ตรวจคูปอง"}
            </Button>
          )}
        </div>
        {couponInfo && (
          <>
            <p className="text-sm font-medium text-violet-700">
              🎁 {couponInfo.rewardName} · {couponInfo.customerName || "ลูกค้า"} — บิลนี้เก็บ 0
              บาท (ค่ามือหมอจ่ายปกติ)
            </p>
            <input type="hidden" name="redemption_id" value={couponInfo.redemptionId} />
          </>
        )}
      </div>

      {/* คูปอง/โปรโมชั่น + ส่วนลด */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="coupon_promo">
            {isGowabi ? "รหัส Gowabi" : "คูปอง / โปรโมชั่น"}
          </Label>
          {isGowabi || customPromo ? (
            <Input
              id="coupon_promo"
              name="coupon_promo"
              className="h-12"
              value={couponPromo}
              onChange={(e) => setCouponPromo(e.target.value)}
              placeholder={isGowabi ? "เช่น Gowabi 517620293" : "พิมพ์ชื่อโปรฯ"}
            />
          ) : (
            <select
              id="coupon_promo"
              name="coupon_promo"
              value={couponPromo}
              onChange={(e) => {
                if (e.target.value === "__custom__") {
                  setCustomPromo(true)
                  setCouponPromo("")
                  return
                }
                setCouponPromo(e.target.value)
                applyPromoDiscount(e.target.value, serviceId)
              }}
              className="h-12 w-full rounded-md border border-input bg-transparent px-3 text-base shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <option value="">— ไม่มี —</option>
              {promotions.map((p) => (
                <option key={p.id} value={p.name}>
                  {p.name}
                </option>
              ))}
              <option value="__custom__">อื่นๆ (พิมพ์เอง)</option>
            </select>
          )}
        </div>

        {isGowabi ? (
          <div className="space-y-2">
            <Label htmlFor="net_amount">ยอดที่ Gowabi จ่ายจริง (฿)</Label>
            <Input
              id="net_amount"
              name="net_amount"
              type="number"
              inputMode="numeric"
              min={0}
              className="h-12"
              value={gowabiNet}
              onChange={(e) => setGowabiNet(e.target.value)}
              placeholder={service ? String(service.price) : "0"}
            />
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="discount">ส่วนลด (฿)</Label>
            <Input
              id="discount"
              name="discount"
              type="number"
              inputMode="numeric"
              min={0}
              className="h-12"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              onBlur={() => {
                // เศษสตางค์ทำให้เบราว์เซอร์บล็อกปุ่มชำระ (step=1) — ปัดเป็นบาทเต็มให้เลย
                const n = Number(discount)
                if (discount !== "" && Number.isFinite(n) && !Number.isInteger(n)) {
                  setDiscount(String(Math.round(n)))
                }
              }}
              placeholder="0"
            />
          </div>
        )}
      </div>

      {/* รีเควส — ค่าตายตัว ติ๊กแล้วระบบคิดให้เลย ไม่ให้พิมพ์เอง (กันคีย์ผิด) */}
      <div className="flex items-center gap-3 rounded-lg border p-3">
        <Checkbox
          id="is_request"
          name="is_request"
          checked={isRequest}
          onCheckedChange={(v) => setIsRequest(v === true)}
        />
        <Label htmlFor="is_request" className="flex-1 cursor-pointer">
          ลูกค้ารีเควสหมอ{" "}
          <span className="font-normal text-slate-500">
            (หมอได้ +{REQUEST_FEE} ฿ — ร้านจ่าย ไม่บวกเงินลูกค้า)
          </span>
        </Label>
        {isRequest && (
          <>
            <input type="hidden" name="request_fee" value={REQUEST_FEE} />
            <span className="text-sm text-slate-500">หมอ +{REQUEST_FEE} ฿</span>
          </>
        )}
      </div>

      {/* ห้องสปาส่วนตัว — ลูกค้าจ่ายเพิ่ม บวกเข้ายอดบิล (ราคาล็อกฝั่ง server) */}
      <div className="flex items-center gap-3 rounded-lg border p-3">
        <Checkbox
          id="private_room"
          name="private_room"
          checked={privateRoom}
          onCheckedChange={(v) => setPrivateRoom(v === true)}
        />
        <Label htmlFor="private_room" className="flex-1 cursor-pointer">
          ห้องสปาส่วนตัว{" "}
          <span className="font-normal text-slate-500">(+{PRIVATE_ROOM_FEE} ฿)</span>
        </Label>
        {privateRoom && (
          <span className="font-semibold text-emerald-700">+{PRIVATE_ROOM_FEE} ฿</span>
        )}
      </div>

      {/* บิลชุด: รายการที่ 2+ ของลูกค้าคนเดิม จ่ายรวมครั้งเดียว (Gowabi ไม่รองรับ) */}
      {!isGowabi && (
        <fieldset className="space-y-3">
          {extras.map((x, i) => (
            <div key={i} className="space-y-2 rounded-lg border border-emerald-200 p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">รายการที่ {i + 2}</p>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-red-600"
                  onClick={() => setExtras((arr) => arr.filter((_, j) => j !== i))}
                >
                  ลบรายการ
                </Button>
              </div>
              <ServiceCombobox
                services={services}
                value={x.serviceId}
                onChange={(id) => {
                  const d = computedPromoDiscount(x.couponPromo, id)
                  setExtra(i, { serviceId: id, ...(d != null ? { discount: d } : {}) })
                }}
                aria-label={`เมนูรายการที่ ${i + 2}`}
                triggerClassName="h-11 text-sm"
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={x.therapistId}
                  onChange={(e) => setExtra(i, { therapistId: e.target.value })}
                  className="h-11 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none"
                  aria-label={`หมอนวดรายการที่ ${i + 2}`}
                >
                  <option value="">— เลือกหมอ —</option>
                  {therapists.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <select
                  value={x.couponPromo}
                  onChange={(e) => {
                    const d = computedPromoDiscount(e.target.value, x.serviceId)
                    setExtra(i, {
                      couponPromo: e.target.value,
                      ...(d != null ? { discount: d } : {}),
                    })
                  }}
                  className="h-11 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none"
                  aria-label={`โปรโมชั่นรายการที่ ${i + 2}`}
                >
                  <option value="">ไม่ใช้โปรฯ</option>
                  {promotions.map((pr) => (
                    <option key={pr.id} value={pr.name}>
                      {pr.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  placeholder="ส่วนลด (฿)"
                  value={x.discount}
                  onChange={(e) => setExtra(i, { discount: e.target.value })}
                  onBlur={() => {
                    const n = Number(x.discount)
                    if (x.discount !== "" && Number.isFinite(n) && !Number.isInteger(n)) {
                      setExtra(i, { discount: String(Math.round(n)) })
                    }
                  }}
                  className="h-11 w-32"
                  aria-label={`ส่วนลดรายการที่ ${i + 2}`}
                />
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={x.isRequest}
                    onCheckedChange={(v) => setExtra(i, { isRequest: v === true })}
                  />
                  รีเควส (หมอ +{REQUEST_FEE} ฿ ร้านจ่าย)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={x.privateRoom}
                    onCheckedChange={(v) => setExtra(i, { privateRoom: v === true })}
                  />
                  ห้องสปา (+{PRIVATE_ROOM_FEE} ฿)
                </label>
                {x.serviceId && (
                  <span className="ml-auto text-sm font-medium text-slate-700">
                    {formatBaht(extraNet(x))} บาท
                  </span>
                )}
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => setExtras((arr) => [...arr, { ...BLANK_EXTRA, therapistId }])}
          >
            + เพิ่มรายการ (ลูกค้าคนเดิม จ่ายรวมบิลเดียว)
          </Button>
        </fieldset>
      )}

      {/* หมายเหตุ (ไม่บังคับ) */}
      <div className="space-y-2">
        <Label htmlFor="pos_notes">
          หมายเหตุ <span className="font-normal text-slate-500">(ไม่บังคับ)</span>
        </Label>
        <Input
          id="pos_notes"
          name="notes"
          className="h-11"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="เช่น Happy Hour · ลูกค้าประจำ"
        />
      </div>

      {/* สรุปยอด — โชว์ที่มาของตัวเลขให้เห็นก่อนกดบันทึก */}
      <Card className="border-emerald-200 bg-emerald-50">
        <CardContent className="space-y-1.5 py-4">
          {service && !isGowabi && Number(discount) > 0 && (
            <>
              <div className="flex items-baseline justify-between text-sm text-slate-600">
                <span>ราคาปกติ</span>
                <span>{formatBaht(service.price)} บาท</span>
              </div>
              <div className="flex items-baseline justify-between text-sm text-red-600">
                <span>ส่วนลด</span>
                <span>-{formatBaht(Math.min(Number(discount) || 0, service.price))} บาท</span>
              </div>
            </>
          )}
          {service && isGowabi && (
            <div className="flex items-baseline justify-between text-sm text-slate-600">
              <span>ราคาปกติ (Gowabi เก็บเงินแทนร้าน)</span>
              <span>{formatBaht(service.price)} บาท</span>
            </div>
          )}
          {extras.length > 0 && (
            <>
              <div className="flex items-baseline justify-between text-sm text-slate-600">
                <span>รายการที่ 1{service ? ` · ${service.name}` : ""}</span>
                <span>{formatBaht(netAmount)} บาท</span>
              </div>
              {extras.map((x, i) => {
                const svc = services.find((s) => s.id === x.serviceId)
                return (
                  <div
                    key={i}
                    className="flex items-baseline justify-between text-sm text-slate-600"
                  >
                    <span>
                      รายการที่ {i + 2}
                      {svc ? ` · ${svc.name}` : " · ยังไม่เลือกเมนู"}
                    </span>
                    <span>{formatBaht(extraNet(x))} บาท</span>
                  </div>
                )
              })}
            </>
          )}
          {/* นโยบายร้าน: ทุกคนสะสมแต้ม — เตือนก่อนบันทึกถ้าบิลนี้จะไม่ได้แต้ม */}
          {!customerId && !customerPhone.trim() && (
            <p className="text-xs font-medium text-amber-700">
              ⚠️ ยังไม่ได้ผูกลูกค้า — บิลนี้จะไม่สะสมแต้ม (เลือกลูกค้า หรือกรอกชื่อ+เบอร์
              ระบบจะผูก/สร้างสมาชิกให้เอง)
            </p>
          )}
          <div className="flex items-baseline justify-between">
            <span className="font-medium">
              {extras.length > 0
                ? `ยอดรวมทั้งบิล (${extras.length + 1} รายการ)`
                : "ยอดรับจริง"}
            </span>
            <span className="text-3xl font-bold text-emerald-800">
              {formatBaht(billTotalNet)} <span className="text-base font-normal">บาท</span>
            </span>
          </div>
        </CardContent>
      </Card>

      <Button
        type="submit"
        className={cn("h-14 w-full text-lg")}
        disabled={pending || !therapistId || !serviceId || !effectivePaymentMethod}
      >
        {pending ? "กำลังบันทึก..." : "บันทึกการขาย"}
      </Button>
      {/* บอกให้รู้ว่าปุ่มยังกดไม่ได้เพราะขาดอะไร — ไม่ต้องเดา */}
      {!pending && (!therapistId || !serviceId || !effectivePaymentMethod) && (
        <p className="text-center text-xs text-slate-500">
          ยังไม่ได้เลือก:{" "}
          {[
            !therapistId && "หมอนวด",
            !serviceId && "เมนูบริการ",
            !effectivePaymentMethod && "ช่องทางชำระเงิน",
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
    </form>
  )
}
