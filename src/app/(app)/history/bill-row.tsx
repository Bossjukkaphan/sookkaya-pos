"use client"

import { useState } from "react"

import { formatBaht } from "@/lib/constants"
import {
  CHANNEL_LABEL,
  SOURCE_LABEL,
  isBookingChannel,
  isCustomerSource,
} from "@/lib/customer-source"
import { PAY_COLOR, PAY_COLOR_DEFAULT } from "@/lib/payment-colors"
import { formatThaiDate } from "@/lib/datetime"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/** ข้อมูลบิลเท่าที่หน้าประวัติต้องแสดง — แปลง numeric เป็น number มาแล้วจาก server */
export type BillRecord = {
  id: string
  bill_id: string | null
  receipt_no: string | null
  sale_date: string
  sale_time: string | null
  service_name: string | null
  therapist_name: string
  customer_name: string | null
  customer_phone: string | null
  price_normal: number
  discount: number
  coupon_promo: string | null
  net_amount: number
  commission: number
  request_fee: number
  room_fee: number
  is_request: boolean
  payment_method: string
  credit_used: number
  /** เครดิตคงเหลือหลังบิลนี้ (snapshot ตอนขาย) — null สำหรับบิลเก่าก่อนมีฟีเจอร์ */
  credit_after: number | null
  bonus_used: number
  revenue_recognize: number
  source: string | null
  booking_channel: string | null
  bed_label: string | null
  notes: string | null
  created_by: string | null
  /** เวลาที่กดบันทึกจริง (ISO) — คนละตัวกับ sale_time ซึ่งคือเวลาใช้บริการ */
  created_at: string | null
  edited_by: string | null
}

/** timestamp → "23 ก.ค. 15:42 น." เวลาไทย — ใช้บอกว่าบิลถูกคีย์เข้าระบบเมื่อไหร่ */
function formatRecordedAt(iso: string): string {
  const d = new Date(iso)
  const date = new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
  }).format(d)
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d)
  return `${date} ${time} น.`
}

/** บรรทัดข้อมูลใน dialog — ค่าว่างไม่ต้องแสดงแถว ลดความรก */
function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className="text-right font-medium break-words">{value}</span>
    </div>
  )
}

export function BillRow({ bill }: { bill: BillRecord }) {
  const [open, setOpen] = useState(false)

  const sourceLabel =
    bill.source && isCustomerSource(bill.source)
      ? SOURCE_LABEL[bill.source] +
        (bill.booking_channel && isBookingChannel(bill.booking_channel)
          ? ` (${CHANNEL_LABEL[bill.booking_channel]})`
          : "")
      : null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-slate-50 sm:px-6"
      >
        <div className="w-20 shrink-0">
          <p className="text-sm font-semibold tabular-nums">
            {bill.sale_time?.slice(0, 5) ?? "--:--"}
          </p>
          <p className="text-[11px] text-slate-400">
            {formatThaiDate(bill.sale_date)}
          </p>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{bill.service_name ?? "ไม่ระบุบริการ"}</p>
          <p className="truncate text-sm text-slate-500">
            {bill.customer_name ? `${bill.customer_name} · ` : ""}
            {bill.therapist_name}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
            PAY_COLOR[bill.payment_method] ?? PAY_COLOR_DEFAULT
          }`}
        >
          {bill.payment_method}
        </span>
        <span className="shrink-0 text-base font-bold whitespace-nowrap text-emerald-800">
          {formatBaht(bill.net_amount)} ฿
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {bill.receipt_no ? `บิล ${bill.receipt_no}` : "รายละเอียดบิล"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Row
              label="เวลาใช้บริการ"
              value={`${formatThaiDate(bill.sale_date)} ${bill.sale_time?.slice(0, 5) ?? ""} น.`}
            />
            <Row
              label="บันทึกเมื่อ"
              value={bill.created_at ? formatRecordedAt(bill.created_at) : null}
            />
            <Row
              label="ลูกค้า"
              value={
                bill.customer_name
                  ? bill.customer_name +
                    (bill.customer_phone ? ` · ${bill.customer_phone}` : "")
                  : null
              }
            />
            <Row label="หมอนวด" value={bill.therapist_name} />
            <Row label="บริการ" value={bill.service_name} />
            <Row label="เตียง" value={bill.bed_label} />
            <Row label="ลูกค้ามาจาก" value={sourceLabel} />

            <div className="my-2 border-t" />

            <Row label="ราคาปกติ" value={`${formatBaht(bill.price_normal)} ฿`} />
            {bill.discount > 0 && (
              <div className="flex justify-between gap-3 text-sm">
                <span className="text-slate-500">ส่วนลด</span>
                <span className="font-medium text-red-600">
                  -{formatBaht(bill.discount)} ฿
                  {bill.coupon_promo ? ` (${bill.coupon_promo})` : ""}
                </span>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <span className="font-semibold">ยอดรับจริง</span>
              <span className="text-lg font-bold text-emerald-700">
                {formatBaht(bill.net_amount)} ฿
              </span>
            </div>
            <Row label="ช่องทางชำระ" value={bill.payment_method} />
            {bill.credit_used > 0 && (
              <Row label="เครดิตที่ใช้" value={`${formatBaht(bill.credit_used)} ฿`} />
            )}
            {bill.credit_after !== null && (
              <div className="flex justify-between gap-3 text-sm">
                <span className="shrink-0 text-slate-500">เครดิตคงเหลือหลังบิลนี้</span>
                <span className="font-semibold text-violet-700">
                  {formatBaht(bill.credit_after)} ฿
                </span>
              </div>
            )}
            {bill.bonus_used > 0 && (
              <Row label="โบนัสที่ใช้" value={`${formatBaht(bill.bonus_used)} ฿`} />
            )}
            <Row
              label="รายได้รับรู้ (P&L)"
              value={`${formatBaht(bill.revenue_recognize)} ฿`}
            />

            <div className="my-2 border-t" />

            <Row
              label="ค่ามือหมอ"
              value={`${formatBaht(bill.commission)} ฿${
                bill.is_request ? ` · รีเควสหมอ (ร้านจ่าย +${formatBaht(bill.request_fee)} ฿)` : ""
              }${
                bill.room_fee > 0 ? ` · ห้องสปา +${formatBaht(bill.room_fee)} ฿` : ""
              }`}
            />
            <Row label="หมายเหตุ" value={bill.notes} />
            <Row label="สร้างโดย" value={bill.created_by} />
            <Row label="แก้ไขโดย" value={bill.edited_by} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
