import { getBookingOptions } from "./actions"
import { BookingWizard } from "./wizard"

export const dynamic = "force-dynamic"

export default async function BookPage() {
  const options = await getBookingOptions()
  if (!options.ok) {
    return (
      <div className="rounded-xl border bg-white p-4 text-center text-sm text-slate-600">
        โหลดข้อมูลไม่สำเร็จ ปิดแล้วเปิดใหม่จากไลน์นะคะ
      </div>
    )
  }
  return <BookingWizard services={options.services} therapists={options.therapists} />
}
