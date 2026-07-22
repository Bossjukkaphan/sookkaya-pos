"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Pencil } from "lucide-react"
import { toast } from "sonner"

import { updateSale } from "../sale-actions"
import { CustomerPicker } from "../pos/customer-picker"
import { computeSaleAmounts } from "@/lib/sale-math"
import {
  GOWABI_METHOD,
  MEMBER_CREDIT_METHOD,
  PAYMENT_METHODS,
  formatBaht,
} from "@/lib/constants"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export type Therapist = { id: string; name: string }
export type Service = { id: string; name: string; price: number; commission: number }
export type Promotion = { id: string; name: string }
export type MemberBalance = {
  credit_balance: number
  credit_granted: number
  cash_paid: number
}

/** ข้อมูลรายการขายเท่าที่ฟอร์มแก้ไขต้องใช้ — แปลง numeric ของ postgres เป็น number มาแล้ว */
export type EditableSale = {
  id: string
  receipt_no: string | null
  sale_time: string | null
  service_id: string | null
  service_name: string | null
  therapist_id: string | null
  customer_id: string | null
  customer_name: string | null
  customer_phone: string | null
  coupon_promo: string | null
  discount: number
  net_amount: number
  payment_method: string
  is_request: boolean
  request_fee: number
  credit_used: number
  revenue_recognize: number
  notes: string | null
  /** เวอร์ชันของแถวตอนที่หน้านี้ถูก render — ส่งกลับไปให้ updateSale เทียบกันแก้ทับ */
  updated_at: string
}

const SELECT_CLASS =
  "h-12 w-full rounded-md border border-input bg-transparent px-3 text-base shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"

export function EditSaleButton({
  sale,
  therapists,
  services,
  promotions,
  balance,
  currentTherapistName,
}: {
  sale: EditableSale
  therapists: Therapist[]
  services: Service[]
  promotions: Promotion[]
  /** ยอดเครดิตของลูกค้าเจ้าของรายการนี้ · null = ไม่ใช่สมาชิก/ไม่มีลูกค้า */
  balance: MemberBalance | null
  /** ชื่อหมอของรายการนี้ เผื่อหมอลาออกไปแล้วและไม่อยู่ในรายชื่อที่ใช้งานอยู่ */
  currentTherapistName: string | null
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label={`แก้ไขรายการ ${sale.service_name ?? ""} ${formatBaht(sale.net_amount)} บาท`}
      >
        <Pencil className="size-4 text-slate-600" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>แก้ไขรายการขาย</DialogTitle>
            <DialogDescription>
              {sale.receipt_no ?? "ไม่มีเลขใบเสร็จ"}
              {sale.sale_time && ` · ${sale.sale_time.slice(0, 5)}`} — วันที่
              เวลา และเลขใบเสร็จแก้ไม่ได้
            </DialogDescription>
          </DialogHeader>
          {/* key = ปิดแล้วเปิดใหม่ให้ค่าในฟอร์มกลับไปตรงกับข้อมูลที่แสดงอยู่เสมอ */}
          {open && (
            <EditSaleForm
              key={sale.id}
              sale={sale}
              therapists={therapists}
              services={services}
              promotions={promotions}
              balance={balance}
              currentTherapistName={currentTherapistName}
              onDone={() => setOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function EditSaleForm({
  sale,
  therapists,
  services,
  promotions,
  balance,
  currentTherapistName,
  onDone,
}: {
  sale: EditableSale
  therapists: Therapist[]
  services: Service[]
  promotions: Promotion[]
  balance: MemberBalance | null
  currentTherapistName: string | null
  onDone: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [therapistId, setTherapistId] = useState(sale.therapist_id ?? "")
  const [serviceId, setServiceId] = useState(sale.service_id ?? "")
  const [paymentMethod, setPaymentMethod] = useState(sale.payment_method)
  const [discount, setDiscount] = useState(
    sale.discount > 0 ? String(sale.discount) : ""
  )
  const [gowabiNet, setGowabiNet] = useState(
    sale.payment_method === GOWABI_METHOD ? String(sale.net_amount) : ""
  )
  const [isRequest, setIsRequest] = useState(sale.is_request)
  const [requestFee, setRequestFee] = useState(
    sale.request_fee > 0 ? String(sale.request_fee) : ""
  )
  const [customerId, setCustomerId] = useState(sale.customer_id ?? "")
  const [customerName, setCustomerName] = useState(sale.customer_name ?? "")
  const [customerPhone, setCustomerPhone] = useState(sale.customer_phone ?? "")
  const [couponPromo, setCouponPromo] = useState(sale.coupon_promo ?? "")
  // โปรฯ เดิมอาจถูกปิดไปแล้วหรือเป็นรหัส Gowabi — ถ้าไม่มีใน dropdown ให้เริ่มที่ช่องพิมพ์
  const [customPromo, setCustomPromo] = useState(
    sale.payment_method !== GOWABI_METHOD &&
      !!sale.coupon_promo &&
      !promotions.some((p) => p.name === sale.coupon_promo)
  )

  const isGowabi = paymentMethod === GOWABI_METHOD
  const isMemberCredit = paymentMethod === MEMBER_CREDIT_METHOD

  // หมอที่ลาออกแล้วยังต้องเห็นชื่อในฟอร์ม ไม่งั้นดูเหมือนรายการนี้ไม่มีหมอ
  const pickableTherapists = useMemo(() => {
    if (!sale.therapist_id) return therapists
    if (therapists.some((t) => t.id === sale.therapist_id)) return therapists
    return [
      ...therapists,
      { id: sale.therapist_id, name: currentTherapistName ?? "หมอที่ลาออกแล้ว" },
    ]
  }, [therapists, sale.therapist_id, currentTherapistName])

  const service = useMemo(
    () => services.find((s) => s.id === serviceId),
    [services, serviceId]
  )

  // เมนูที่ปิดไปแล้วไม่อยู่ใน list — ต้องใส่กลับเข้าไปไม่งั้น pre-fill จะว่าง
  const serviceMissing = !!sale.service_id && !services.some((s) => s.id === sale.service_id)

  const ratio =
    balance && balance.credit_granted > 0
      ? balance.cash_paid / balance.credit_granted
      : 1

  // พรีวิวใช้ฟังก์ชันเดียวกับที่ server ใช้ตอนบันทึก ตัวเลขจึงไม่มีทางขัดกัน
  const preview = useMemo(
    () =>
      computeSaleAmounts({
        priceNormal: service?.price ?? 0,
        discount: Math.max(0, Number(discount) || 0),
        paymentMethod,
        gowabiNet: isGowabi ? Math.max(0, Number(gowabiNet) || 0) : null,
        isRequest,
        requestFee: Number(requestFee) || 0,
        serviceCommission: service?.commission ?? 0,
        memberRatio: isMemberCredit ? ratio : null,
      }),
    [
      service,
      discount,
      paymentMethod,
      gowabiNet,
      isGowabi,
      isRequest,
      requestFee,
      isMemberCredit,
      ratio,
    ]
  )

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)

    startTransition(async () => {
      const result = await updateSale(sale.id, formData)
      if (result.ok) {
        toast.success("แก้ไขแล้ว")
        onDone()
        router.refresh()
      } else {
        toast.error(result.error)
        // บันทึกไม่ผ่าน — ดึงข้อมูลใหม่ให้หน้าข้างหลัง เผื่อสาเหตุคือมีคนแก้ไปก่อน
        // ปิดแล้วเปิดกล่องใหม่จะได้ค่าล่าสุดพร้อม updated_at ตัวใหม่ กดบันทึกซ้ำจึงผ่านได้
        router.refresh()
      }
    })
  }

  const uid = (name: string) => `${name}-${sale.id}`

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* เวอร์ชันของแถวตอนเปิดฟอร์ม — updateSale เอาไปเทียบว่ามีคนแก้แซงไปหรือยัง */}
      <input type="hidden" name="updated_at" value={sale.updated_at} />

      {/* หมอนวด */}
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">หมอนวด</legend>
        <input type="hidden" name="therapist_id" value={therapistId} />
        <div className="grid grid-cols-3 gap-2">
          {pickableTherapists.map((t) => (
            <Button
              key={t.id}
              type="button"
              variant={therapistId === t.id ? "default" : "outline"}
              className="h-11 text-xs sm:text-sm"
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
        <Label htmlFor={uid("service_id")}>เมนูบริการ</Label>
        <select
          id={uid("service_id")}
          name="service_id"
          value={serviceId}
          onChange={(e) => setServiceId(e.target.value)}
          className={SELECT_CLASS}
        >
          <option value="">— เลือกเมนู —</option>
          {serviceMissing && sale.service_id && (
            <option value={sale.service_id}>
              {sale.service_name ?? "เมนูเดิม"} (เมนูที่ปิดแล้ว)
            </option>
          )}
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

      {/* ช่องทางชำระเงิน */}
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">ช่องทางชำระเงิน</legend>
        <input type="hidden" name="payment_method" value={paymentMethod} />
        <div className="grid grid-cols-3 gap-2">
          {PAYMENT_METHODS.map((m) => (
            <Button
              key={m}
              type="button"
              variant={paymentMethod === m ? "default" : "outline"}
              className="h-11 text-xs sm:text-sm"
              onClick={() => {
                // ช่องเดียวกันใช้เก็บทั้งรหัส Gowabi และชื่อโปรฯ — สลับประเภทต้องล้าง
                if ((m === GOWABI_METHOD) !== isGowabi) {
                  setCouponPromo("")
                  setCustomPromo(false)
                }
                setPaymentMethod(m)
              }}
              aria-pressed={paymentMethod === m}
            >
              {m}
            </Button>
          ))}
        </div>
      </fieldset>

      {/* คูปอง/โปรโมชั่น + ส่วนลด */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor={uid("coupon_promo")}>
            {isGowabi ? "รหัส Gowabi" : "คูปอง / โปรโมชั่น"}
          </Label>
          {isGowabi || customPromo ? (
            <Input
              id={uid("coupon_promo")}
              name="coupon_promo"
              className="h-12"
              value={couponPromo}
              onChange={(e) => setCouponPromo(e.target.value)}
              placeholder={isGowabi ? "เช่น Gowabi 517620293" : "พิมพ์ชื่อโปรฯ"}
            />
          ) : (
            <select
              id={uid("coupon_promo")}
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
              className={SELECT_CLASS}
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
            <Label htmlFor={uid("net_amount")}>ยอดที่ Gowabi จ่ายจริง (฿)</Label>
            <Input
              id={uid("net_amount")}
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
            <Label htmlFor={uid("discount")}>ส่วนลด (฿)</Label>
            <Input
              id={uid("discount")}
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

      {/* หมายเหตุ — ฟอร์มนี้ส่งทุกช่องตอนบันทึก ต้องมีช่องนี้ไม่งั้นการแก้จะลบหมายเหตุเดิมทิ้ง */}
      <div className="space-y-2">
        <Label htmlFor={uid("notes")}>
          หมายเหตุ <span className="font-normal text-slate-500">(ไม่บังคับ)</span>
        </Label>
        <Input
          id={uid("notes")}
          name="notes"
          className="h-12"
          defaultValue={sale.notes ?? ""}
          placeholder="เช่น Happy Hour"
        />
      </div>

      {/* รีเควส */}
      <div className="flex items-center gap-3 rounded-lg border p-3">
        <Checkbox
          id={uid("is_request")}
          name="is_request"
          checked={isRequest}
          onCheckedChange={(v) => setIsRequest(v === true)}
        />
        <Label htmlFor={uid("is_request")} className="flex-1 cursor-pointer">
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

      {/* เครดิตสมาชิก — เพดานที่แก้ได้คือคงเหลือ + ที่รายการนี้เคยตัดไป
          ตัวเลขชุดนี้เป็นของลูกค้าเจ้าของรายการเดิมเท่านั้น ถ้าเปลี่ยนลูกค้าแล้วยังโชว์อยู่
          เพดานจะสูงเกินจริง เพราะ updateSale คืนเครดิตให้เฉพาะตอนที่ยังเป็นคนเดิม */}
      {isMemberCredit &&
        (customerId === sale.customer_id && balance ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs">
            <p>
              เครดิตคงเหลือตอนนี้ <strong>{formatBaht(balance.credit_balance)} ฿</strong> ·
              รายการนี้ตัดไป <strong>{formatBaht(sale.credit_used)} ฿</strong>
            </p>
            <p className="font-medium text-emerald-900">
              แก้เป็นได้สูงสุด {formatBaht(balance.credit_balance + sale.credit_used)} ฿
            </p>
            {ratio < 1 && (
              <p className="mt-1 text-amber-700">
                สัดส่วนรับรู้รายได้ตอนนี้คือ {Math.round(ratio * 100)}% —
                ถ้าลูกค้าเติมเงินหลังวันที่ขาย ตัวเลขรายได้รับรู้ของรายการนี้จะเปลี่ยนหลังกดบันทึก
                (ตอนนี้ {formatBaht(sale.revenue_recognize)} ฿)
              </p>
            )}
          </div>
        ) : (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            เปลี่ยนลูกค้าแล้ว — เครดิตของรายการเดิมจะถูกคืนให้ลูกค้าคนเก่า
            และตัดใหม่จากเครดิตของลูกค้าคนใหม่ ระบบจะตรวจให้ตอนกดบันทึก
            ถ้าเครดิตไม่พอจะแจ้งเตือน
          </div>
        ))}

      {/* สรุปยอด — คิดด้วย computeSaleAmounts ตัวเดียวกับฝั่ง server */}
      <Card className="border-emerald-200 bg-emerald-50">
        <CardContent className="flex items-baseline justify-between py-3">
          <span className="font-medium">ยอดสุทธิ</span>
          <span className="text-2xl font-bold text-emerald-800">
            {formatBaht(preview.netAmount)}{" "}
            <span className="text-base font-normal">บาท</span>
          </span>
        </CardContent>
      </Card>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          ยกเลิก
        </Button>
        <Button
          type="submit"
          disabled={pending || !therapistId || !serviceId || !paymentMethod}
        >
          {pending ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
        </Button>
      </DialogFooter>
    </form>
  )
}
