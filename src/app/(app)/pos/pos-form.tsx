"use client"

import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"

import { checkPointCoupon, createSale, type CouponCheck } from "../sale-actions"
import { CustomerPicker } from "./customer-picker"
import {
  GOWABI_METHOD,
  MEMBER_CREDIT_METHOD,
  PAYMENT_METHODS,
  REQUEST_FEE,
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
}

const BLANK_EXTRA: ExtraItem = {
  serviceId: "",
  therapistId: "",
  couponPromo: "",
  discount: "",
  isRequest: false,
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
  const [pending, startTransition] = useTransition()

  const service = useMemo(
    () => services.find((s) => s.id === serviceId),
    [services, serviceId]
  )

  const isGowabi = paymentMethod === GOWABI_METHOD
  const isMemberCredit = paymentMethod === MEMBER_CREDIT_METHOD

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
    return Math.max(0, svc.price - (Number(x.discount) || 0))
  }

  const netAmount = useMemo(() => {
    if (!service) return 0
    if (isGowabi) return Math.max(0, Number(gowabiNet) || 0)
    return Math.max(0, service.price - (Number(discount) || 0))
  }, [service, discount, gowabiNet, isGowabi])

  function resetForm() {
    setTherapistId("")
    setServiceId("")
    setPaymentMethod("")
    setDiscount("")
    setGowabiNet("")
    setIsRequest(false)
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

    startTransition(async () => {
      // บิลชุด: ทุกรายการแชร์ bill_id เดียว — สร้างฝั่ง client เพราะต้องใส่ตั้งแต่แถวแรก
      if (extras.length > 0) formData.set("bill_id", crypto.randomUUID())
      const result = await createSale(formData)
      if (!result.ok) {
        toast.error(result.error)
        return
      }

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
        if (x.isRequest) {
          fd.set("is_request", "on")
          fd.set("request_fee", String(REQUEST_FEE))
        }
        const r = await createSale(fd)
        if (r.ok) {
          okCount++
          if (r.creditAfter !== null) creditAfter = r.creditAfter
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
        <Label htmlFor="sale_time">เวลาที่ใช้บริการ</Label>
        <Input
          id="sale_time"
          name="sale_time"
          type="time"
          value={serviceTime}
          onChange={(e) => setServiceTime(e.target.value)}
          className="h-12 w-40"
          required
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
        }}
        onNameChange={(name) => {
          setCustomerName(name)
          setCustomerId("")
        }}
        onPhoneChange={setCustomerPhone}
        requireMember={isMemberCredit}
      />

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
        <input type="hidden" name="payment_method" value={paymentMethod} />
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
                paymentMethod === m && (PAY_SELECTED[m] ?? PAY_SELECTED_DEFAULT)
              )}
              onClick={() => {
                // ช่องนี้เปลี่ยนความหมายระหว่าง "รหัสจอง Gowabi" กับ "ชื่อโปรโมชั่น"
                // ถ้าไม่ล้างค่าเดิม ค่าที่ค้างจะถูกบันทึกข้ามประเภทกันโดยไม่มีอะไรเตือน
                if ((m === GOWABI_METHOD) !== isGowabi) {
                  setCouponPromo("")
                  setCustomPromo(false)
                }
                setPaymentMethod(m)
              }}
              aria-pressed={paymentMethod === m}
            >
              <span
                className={cn(
                  "mr-1 inline-block h-2 w-2 shrink-0 rounded-full",
                  paymentMethod === m ? "bg-white/80" : (PAY_DOT[m] ?? PAY_DOT_DEFAULT)
                )}
              />
              {m}
            </Button>
          ))}
        </div>
      </fieldset>

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
          <span className="font-normal text-slate-500">(+{REQUEST_FEE} ฿)</span>
        </Label>
        {isRequest && (
          <>
            <input type="hidden" name="request_fee" value={REQUEST_FEE} />
            <span className="font-semibold text-emerald-700">+{REQUEST_FEE} ฿</span>
          </>
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
                  รีเควส (+{REQUEST_FEE} ฿)
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
          <div className="flex items-baseline justify-between">
            <span className="font-medium">
              {extras.length > 0
                ? `ยอดรวมทั้งบิล (${extras.length + 1} รายการ)`
                : "ยอดรับจริง"}
            </span>
            <span className="text-3xl font-bold text-emerald-800">
              {formatBaht(netAmount + extras.reduce((s, x) => s + extraNet(x), 0))}{" "}
              <span className="text-base font-normal">บาท</span>
            </span>
          </div>
        </CardContent>
      </Card>

      <Button
        type="submit"
        className={cn("h-14 w-full text-lg")}
        disabled={pending || !therapistId || !serviceId || !paymentMethod}
      >
        {pending ? "กำลังบันทึก..." : "บันทึกการขาย"}
      </Button>
      {/* บอกให้รู้ว่าปุ่มยังกดไม่ได้เพราะขาดอะไร — ไม่ต้องเดา */}
      {!pending && (!therapistId || !serviceId || !paymentMethod) && (
        <p className="text-center text-xs text-slate-500">
          ยังไม่ได้เลือก:{" "}
          {[
            !therapistId && "หมอนวด",
            !serviceId && "เมนูบริการ",
            !paymentMethod && "ช่องทางชำระเงิน",
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
    </form>
  )
}
