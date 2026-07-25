"use client"

import { useMemo, useState } from "react"
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react"

import { formatBaht } from "@/lib/constants"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

/** เมนูบริการเท่าที่ combobox ต้องใช้ — แต่ละฟอร์มมี field ไม่เท่ากัน จึงบังคับแค่ id+name */
export type ComboboxService = {
  id: string
  name: string
  price?: number | null
  duration_min?: number | null
}

/** บรรทัดรอง: ราคา · ระยะเวลา — ไม่ซ้ำกับที่มีในชื่อเมนูอยู่แล้ว */
function detailLine(s: ComboboxService): string {
  const parts: string[] = []
  if (s.price != null) parts.push(`${formatBaht(s.price)}฿`)
  // ชื่อเมนูส่วนใหญ่ลงท้าย "90 นาที" อยู่แล้ว — ไม่ต้องโชว์ซ้ำ
  if (s.duration_min != null && !s.name.includes(`${s.duration_min} นาที`)) {
    parts.push(`${s.duration_min} นาที`)
  }
  return parts.join(" · ")
}

/** ข้อความที่ใช้ค้นหา — พิมพ์ "อโรมา" เจอตามชื่อ, "90" เจอทั้งชื่อ/ระยะเวลา/ราคา */
function searchText(s: ComboboxService): string {
  return [
    s.name,
    s.price != null ? String(s.price) : "",
    s.duration_min != null ? `${s.duration_min} นาที` : "",
  ]
    .join(" ")
    .toLowerCase()
}

/**
 * ช่องเลือกเมนูบริการแบบพิมพ์ค้นหาได้ — ใช้แทน <select> เดิมทุกจุดฝั่งพนักงาน
 *
 * ส่ง `name` มาเมื่อฟอร์มอ่านค่าผ่าน FormData: จะ render <input type="hidden">
 * ให้ค่าเดินทางแบบเดียวกับ select name= เดิมทุกประการ
 */
export function ServiceCombobox({
  services,
  value,
  onChange,
  placeholder = "— เลือกเมนู —",
  disabled = false,
  name,
  id,
  triggerClassName,
  "aria-label": ariaLabel,
}: {
  services: ComboboxService[]
  value: string
  onChange: (serviceId: string) => void
  placeholder?: string
  disabled?: boolean
  /** ชื่อ field สำหรับฟอร์มที่ submit ผ่าน FormData — แทน name= ของ select เดิม */
  name?: string
  id?: string
  triggerClassName?: string
  "aria-label"?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")

  const selected = useMemo(
    () => services.find((s) => s.id === value),
    [services, value]
  )

  // substring ตรงตัว (ตัดช่องว่างหัวท้าย, ไม่สนตัวพิมพ์) — filter ของ cmdk เป็น fuzzy
  // ซึ่งเดากับข้อความไทยยาก จึงกรองเองให้ผลตรงกับที่พิมพ์เสมอ
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return services
    return services.filter((s) => searchText(s).includes(q))
  }, [services, query])

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) setQuery("") // เปิดใหม่เริ่มค้นจากรายการเต็มเสมอ
      }}
      // modal: ใช้ในกล่องแก้ไข/เพิ่มคิว (Radix Dialog) แล้วโฟกัส+คลิกไม่ชนกัน
      modal
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          id={id}
          disabled={disabled}
          className={cn(
            "h-12 w-full justify-between px-3 text-base font-normal",
            !selected && "text-muted-foreground",
            triggerClassName
          )}
        >
          <span className="truncate">
            {selected ? selected.name : placeholder}
          </span>
          <ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      {/* ค่าเดินเข้า FormData เหมือน select name= เดิม */}
      {name && <input type="hidden" name={name} value={value} />}
      <PopoverContent
        className="w-(--radix-popover-trigger-width) p-0"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="พิมพ์ค้นหาเมนู เช่น อโรมา หรือ 90"
          />
          <CommandList>
            <CommandEmpty>ไม่พบเมนูที่ค้นหา</CommandEmpty>
            {filtered.map((s) => {
              const detail = detailLine(s)
              return (
                <CommandItem
                  key={s.id}
                  value={s.id}
                  onSelect={() => {
                    onChange(s.id)
                    setOpen(false)
                  }}
                  className="min-h-11 px-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{s.name}</p>
                    {detail && (
                      <p className="text-xs text-muted-foreground">{detail}</p>
                    )}
                  </div>
                  <CheckIcon
                    className={cn(
                      "size-4 shrink-0",
                      value === s.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                </CommandItem>
              )
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
