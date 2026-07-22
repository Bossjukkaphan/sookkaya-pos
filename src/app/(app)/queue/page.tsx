import { createClient } from "@/lib/supabase/server"
import { formatThaiDate, todayInShopTz } from "@/lib/datetime"
import { QueueBoard } from "./queue-board"

export const metadata = { title: "คิววันนี้ · สุขกายา POS" }

export default async function QueuePage() {
  const supabase = await createClient()
  const today = todayInShopTz()

  const [{ data: therapists }, { data: services }, { data: entries }] =
    await Promise.all([
      supabase
        .from("therapists")
        .select("id, name")
        .eq("status", "active")
        .order("name"),
      supabase
        .from("services")
        .select("id, name, duration_min")
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("queue_entries")
        .select("*")
        .eq("queue_date", today)
        .neq("status", "cancelled")
        .order("start_time"),
    ])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">คิววันนี้</h1>
        <p className="text-sm text-slate-600">{formatThaiDate(today)}</p>
      </div>
      <QueueBoard
        therapists={therapists ?? []}
        services={services ?? []}
        initialEntries={entries ?? []}
        today={today}
      />
    </div>
  )
}
