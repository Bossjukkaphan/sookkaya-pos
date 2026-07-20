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
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent } from "@/components/ui/card"

type Therapist = { id: string; name: string }
type Service = { id: string; name: string; price: number; commission: number }

export function PosForm({
  therapists,
  services,
}: {
  therapists: Therapist[]
  services: Service[]
}) {
  const [therapistId, setTherapistId] = useState("")
  const [serviceId, setServiceId] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("")
  const [discount, setDiscount] = useState("")
  const [gowabiNet, setGowabiNet] = useState("")
  const [isRequest, setIsRequest] = useState(false)
  const [requestFee, setRequestFee] = useState("")
  const [customerId, setCustomerId] = useState("")
  const [customerName, setCustomerName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [couponPromo, setCouponPromo] = useState("")
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
    setCouponPromo("")
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)

    startTransition(async () => {
      const result = await createSale(formData)
      if (result.ok) {
        toast.success(`บันทึกแล้ว — ใบเสร็จ ${result.receiptNo}`)
        resetForm()
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 pb-4">
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
              className="h-12 text-xs sm:text-sm"
              onClick={() => setPaymentMethod(m)}
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
          <Label htmlFor="coupon_promo">
            {isGowabi ? "รหัส Gowabi" : "คูปอง / โปรโมชั่น"}
          </Label>
          <Input
            id="coupon_promo"
            name="coupon_promo"
            className="h-12"
            value={couponPromo}
            onChange={(e) => setCouponPromo(e.target.value)}
            placeholder={isGowabi ? "เช่น GWB-1234" : "ไม่มีก็เว้นว่าง"}
          />
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

      {/* สรุปยอด */}
      <Card className="border-emerald-200 bg-emerald-50">
        <CardContent className="flex items-baseline justify-between py-4">
          <span className="font-medium">ยอดรับจริง</span>
          <span className="text-3xl font-bold text-emerald-800">
            {formatBaht(netAmount)}{" "}
            <span className="text-base font-normal">บาท</span>
          </span>
        </CardContent>
      </Card>

      <Button
        type="submit"
        className={cn("h-14 w-full text-lg")}
        disabled={pending || !therapistId || !serviceId || !paymentMethod}
      >
        {pending ? "กำลังบันทึก..." : "บันทึกการขาย"}
      </Button>
    </form>
  )
}
