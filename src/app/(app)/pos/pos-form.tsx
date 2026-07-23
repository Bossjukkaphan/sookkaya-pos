"use client"

import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"

import { createSale } from "../sale-actions"
import { CustomerPicker } from "./customer-picker"
import {
  GOWABI_METHOD,
  MEMBER_CREDIT_METHOD,
  PAYMENT_METHODS,
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
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent } from "@/components/ui/card"

type Therapist = { id: string; name: string }
type Service = { id: string; name: string; price: number; commission: number }
type Promotion = { id: string; name: string }
type Bed = { id: string; room: string; name: string }

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
  const [isRequest, setIsRequest] = useState(false)
  const [requestFee, setRequestFee] = useState("")
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
  const [pending, startTransition] = useTransition()

  const service = useMemo(
    () => services.find((s) => s.id === serviceId),
    [services, serviceId]
  )

  const isGowabi = paymentMethod === GOWABI_METHOD
  const isMemberCredit = paymentMethod === MEMBER_CREDIT_METHOD

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
    setRequestFee("")
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
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)

    startTransition(async () => {
      const result = await createSale(formData)
      if (result.ok) {
        toast.success(
          `บันทึกแล้ว — ใบเสร็จ ${result.receiptNo}` +
            (result.creditAfter !== null
              ? ` · เครดิตคงเหลือ ${formatBaht(result.creditAfter)} ฿`
              : ""),
          // มีเลขเครดิตให้พนักงานอ่านแจ้งลูกค้า — ค้างไว้นานกว่าปกติ
          result.creditAfter !== null ? { duration: 8000 } : undefined
        )
        resetForm()
      } else {
        toast.error(result.error)
      }
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
        <select
          id="service_id"
          name="service_id"
          value={serviceId}
          onChange={(e) => setServiceId(e.target.value)}
          className="h-12 w-full rounded-md border border-input bg-transparent px-3 text-base shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <option value="">— เลือกเมนู —</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {formatBaht(s.price)}฿
            </option>
          ))}
        </select>
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
              placeholder="0"
            />
          </div>
        )}
      </div>

      {/* รีเควส */}
      <div className="flex items-center gap-3 rounded-lg border p-3">
        <Checkbox
          id="is_request"
          name="is_request"
          checked={isRequest}
          onCheckedChange={(v) => setIsRequest(v === true)}
        />
        <Label htmlFor="is_request" className="flex-1 cursor-pointer">
          ลูกค้ารีเควสหมอ
        </Label>
        {isRequest && (
          <Input
            name="request_fee"
            type="number"
            inputMode="numeric"
            min={0}
            className="h-10 w-28"
            value={requestFee}
            onChange={(e) => setRequestFee(e.target.value)}
            placeholder="ค่ารีเควส"
            aria-label="ค่ารีเควส (บาท)"
          />
        )}
      </div>

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
          <div className="flex items-baseline justify-between">
            <span className="font-medium">ยอดรับจริง</span>
            <span className="text-3xl font-bold text-emerald-800">
              {formatBaht(netAmount)}{" "}
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
