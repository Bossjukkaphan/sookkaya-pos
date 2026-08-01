# ปุ่ม "ส่งไลน์" ใน /crm — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** แถวใน /crm ของลูกค้าที่ผูกไลน์แล้ว กดส่งข้อความผ่าน OA ลูกค้าได้จากในระบบ — เห็น/แก้ข้อความใน dialog ก่อนส่ง สำเร็จแล้วบันทึกผลอัตโนมัติ แถวหายจากลิสต์

**Architecture:** ต่อยอดของเดิมทั้งหมด — เทมเพลตข้อความ + ตัวตรวจข้อความเป็น pure function ใน `src/lib/crm.ts` (TDD ได้) · server action ใหม่ใน `crm-actions.ts` ตรวจสิทธิ์ → ตรวจว่าไลน์ผูกกับลูกค้าจริง → `pushLineMessage` เดิม → insert `crm_contacts` · client เพิ่มปุ่ม + Dialog (shadcn) ใน `crm-list.tsx` · **ไม่มี migration**

**Tech Stack:** Next.js 16 (App Router, server actions) · Supabase JS · vitest · shadcn/ui Dialog · sonner toast

**Spec:** `docs/superpowers/specs/2026-08-01-crm-line-send-design.md`

## Global Constraints

- ข้อความ: trim แล้วต้องไม่ว่าง และ ≤ **500** ตัวอักษร
- ส่งผ่าน `pushLineMessage` ใน `src/lib/line.ts` (OA ลูกค้า @948kjjjb) — **ห้าม**แตะ token/webhook (Slip2go ใช้ร่วม)
- push ไม่สำเร็จ → **ห้าม** insert `crm_contacts`
- บันทึกผลเป็น result `contacted`, note `"ส่งไลน์"`
- ลูกค้าผูกหลายไลน์ → ใช้แถว `created_at` ล่าสุด
- ไฟล์ "use server" ห้าม export สิ่งที่ไม่ใช่ async function (ดู memory: verify-server-pages) — ค่าคงที่/pure function ไปไว้ `src/lib/crm.ts`
- ก่อนเริ่ม: สร้าง branch `feat/crm-line-send` จาก `main`

---

### Task 0: สร้าง branch

- [ ] **Step 1:**

```bash
cd "/Users/jw/Desktop/Claude Code/sookkaya-pos-v2"
git checkout main && git checkout -b feat/crm-line-send
```

---

### Task 1: lib — เทมเพลตรวมศูนย์ + ตัวตรวจข้อความ

**Files:**
- Modify: `src/lib/crm.ts` (ต่อท้ายไฟล์)
- Test: `src/lib/crm.test.ts` (ต่อท้ายไฟล์)

**Interfaces:**
- Produces:
  - `type CrmListType = "birthday" | "winback" | "new_follow"`
  - `crmMessage(listType: CrmListType, name: string | null | undefined): string` — เลือกเทมเพลตตามประเภทลิสต์ (ย้าย switch ที่ซ้ำอยู่ใน crm-list.tsx มาไว้ที่เดียว)
  - `LINE_MESSAGE_MAX = 500`
  - `validateCrmLineText(text: string): { ok: true; text: string } | { ok: false; error: string }` — trim แล้วเช็คว่าง/ยาวเกิน

- [ ] **Step 1: เขียนเทสต์ที่ fail ก่อน** — ต่อท้าย `src/lib/crm.test.ts`:

```ts
import { crmMessage, validateCrmLineText, LINE_MESSAGE_MAX } from "./crm"

describe("crmMessage", () => {
  it("เลือกเทมเพลตตามประเภทลิสต์", () => {
    expect(crmMessage("birthday", "ส้ม")).toBe(msgBirthday("ส้ม"))
    expect(crmMessage("winback", "ส้ม")).toBe(msgWinback("ส้ม"))
    expect(crmMessage("new_follow", "ส้ม")).toBe(msgNewFollow("ส้ม"))
  })
})

describe("validateCrmLineText", () => {
  it("ข้อความปกติ → ok พร้อม trim", () => {
    expect(validateCrmLineText("  สวัสดีค่ะ  ")).toEqual({ ok: true, text: "สวัสดีค่ะ" })
  })
  it("ว่าง/ช่องว่างล้วน → error", () => {
    expect(validateCrmLineText("   ").ok).toBe(false)
    expect(validateCrmLineText("").ok).toBe(false)
  })
  it("ยาวเกิน 500 → error, พอดี 500 → ok", () => {
    expect(validateCrmLineText("ก".repeat(LINE_MESSAGE_MAX + 1)).ok).toBe(false)
    expect(validateCrmLineText("ก".repeat(LINE_MESSAGE_MAX)).ok).toBe(true)
  })
})
```

- [ ] **Step 2: รันให้เห็นว่า fail**

Run: `export PATH="$HOME/.nvm/versions/node/$(ls ~/.nvm/versions/node | tail -1)/bin:$PATH" && npx vitest run src/lib/crm.test.ts`
Expected: FAIL — `crmMessage is not a function` (หรือ import error)

- [ ] **Step 3: implement** — ต่อท้าย `src/lib/crm.ts`:

```ts
export type CrmListType = "birthday" | "winback" | "new_follow"

/** เลือกเทมเพลตตามประเภทลิสต์ — ที่เดียว ใช้ทั้งปุ่มคัดลอกและปุ่มส่งไลน์ */
export function crmMessage(
  listType: CrmListType,
  name: string | null | undefined
): string {
  return listType === "birthday"
    ? msgBirthday(name)
    : listType === "winback"
      ? msgWinback(name)
      : msgNewFollow(name)
}

/** เพดานความยาวข้อความส่งไลน์ — LINE รับ 5,000 แต่กันเผลอวางยาว */
export const LINE_MESSAGE_MAX = 500

/** ตรวจข้อความก่อนส่งไลน์: trim แล้วต้องไม่ว่างและไม่ยาวเกิน */
export function validateCrmLineText(
  text: string
): { ok: true; text: string } | { ok: false; error: string } {
  const t = text.trim()
  if (!t) return { ok: false, error: "ข้อความว่าง — พิมพ์ก่อนส่งนะคะ" }
  if (t.length > LINE_MESSAGE_MAX)
    return { ok: false, error: `ข้อความยาวเกิน ${LINE_MESSAGE_MAX} ตัวอักษร` }
  return { ok: true, text: t }
}
```

- [ ] **Step 4: รันเทสต์ผ่าน**

Run: `npx vitest run src/lib/crm.test.ts`
Expected: PASS ทุกข้อ (ของเดิมด้วย)

- [ ] **Step 5: Commit**

```bash
git add src/lib/crm.ts src/lib/crm.test.ts
git commit -m "feat(crm): เทมเพลตรวมศูนย์ crmMessage + ตัวตรวจข้อความส่งไลน์"
```

---

### Task 2: server action `sendCrmLineMessage`

**Files:**
- Modify: `src/app/(app)/crm/crm-actions.ts`
- Test: `src/app/(app)/crm/crm-actions.test.ts` (ไฟล์ใหม่ — mock ทุก dependency)

**Interfaces:**
- Consumes: `validateCrmLineText`, `CrmListType` จาก Task 1 · `pushLineMessage(to, text)` จาก `@/lib/line` · `getMyProfile()` จาก `@/lib/auth` · `createClient()` จาก `@/lib/supabase/server`
- Produces: `sendCrmLineMessage(customerId: string, listType: CrmListType, lineUserId: string, text: string): Promise<{ ok: true } | { ok: false; error: string }>`

- [ ] **Step 1: เขียนเทสต์ที่ fail ก่อน** — สร้าง `src/app/(app)/crm/crm-actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest"

// mock ทุกอย่างที่แตะ Next/Supabase/LINE — เทสต์เฉพาะลอจิกของ action
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/auth", () => ({ getMyProfile: vi.fn() }))
vi.mock("@/lib/line", () => ({ pushLineMessage: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))

import { getMyProfile } from "@/lib/auth"
import { pushLineMessage } from "@/lib/line"
import { createClient } from "@/lib/supabase/server"
import { sendCrmLineMessage } from "./crm-actions"

const CUSTOMER = "11111111-1111-1111-1111-111111111111"
const LINE_UID = "Uabc123"

/** สร้าง supabase ปลอม: คุมผล lookup line_accounts + จับ insert crm_contacts */
function fakeSupabase(opts: { linked: boolean; insertError?: string | null }) {
  const insert = vi.fn().mockResolvedValue({
    error: opts.insertError ? { message: opts.insertError } : null,
  })
  const maybeSingle = vi
    .fn()
    .mockResolvedValue({ data: opts.linked ? { line_user_id: LINE_UID } : null })
  const from = vi.fn((table: string) => {
    if (table === "line_accounts") {
      const chain = { select: vi.fn(), eq: vi.fn(), maybeSingle }
      chain.select.mockReturnValue(chain)
      chain.eq.mockReturnValue(chain)
      return chain
    }
    return { insert }
  })
  return { client: { from }, insert }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getMyProfile).mockResolvedValue({
    id: "u1", email: "boss@test.com", full_name: "Boss", role: "owner",
  } as never)
  vi.mocked(pushLineMessage).mockResolvedValue(true)
})

describe("sendCrmLineMessage", () => {
  it("ยังไม่ล็อกอิน → ปฏิเสธ ไม่ push", async () => {
    vi.mocked(getMyProfile).mockResolvedValue(null)
    const r = await sendCrmLineMessage(CUSTOMER, "birthday", LINE_UID, "สวัสดี")
    expect(r.ok).toBe(false)
    expect(pushLineMessage).not.toHaveBeenCalled()
  })

  it("ข้อความว่าง → ปฏิเสธ ไม่ push", async () => {
    const { client } = fakeSupabase({ linked: true })
    vi.mocked(createClient).mockResolvedValue(client as never)
    const r = await sendCrmLineMessage(CUSTOMER, "birthday", LINE_UID, "   ")
    expect(r.ok).toBe(false)
    expect(pushLineMessage).not.toHaveBeenCalled()
  })

  it("ไลน์ไม่ได้ผูกกับลูกค้าคนนี้ → ปฏิเสธ ไม่ push", async () => {
    const { client } = fakeSupabase({ linked: false })
    vi.mocked(createClient).mockResolvedValue(client as never)
    const r = await sendCrmLineMessage(CUSTOMER, "winback", LINE_UID, "สวัสดี")
    expect(r.ok).toBe(false)
    expect(pushLineMessage).not.toHaveBeenCalled()
  })

  it("push ล้มเหลว → ไม่ insert crm_contacts", async () => {
    const { client, insert } = fakeSupabase({ linked: true })
    vi.mocked(createClient).mockResolvedValue(client as never)
    vi.mocked(pushLineMessage).mockResolvedValue(false)
    const r = await sendCrmLineMessage(CUSTOMER, "birthday", LINE_UID, "สวัสดี")
    expect(r.ok).toBe(false)
    expect(insert).not.toHaveBeenCalled()
  })

  it("สำเร็จ → push ด้วยข้อความ trim แล้ว + insert result contacted note ส่งไลน์", async () => {
    const { client, insert } = fakeSupabase({ linked: true })
    vi.mocked(createClient).mockResolvedValue(client as never)
    const r = await sendCrmLineMessage(CUSTOMER, "new_follow", LINE_UID, "  สวัสดีค่ะ  ")
    expect(r).toEqual({ ok: true })
    expect(pushLineMessage).toHaveBeenCalledWith(LINE_UID, "สวัสดีค่ะ")
    expect(insert).toHaveBeenCalledWith({
      customer_id: CUSTOMER,
      list_type: "new_follow",
      result: "contacted",
      note: "ส่งไลน์",
      created_by: "Boss",
    })
  })
})
```

- [ ] **Step 2: รันให้เห็นว่า fail**

Run: `npx vitest run "src/app/(app)/crm/crm-actions.test.ts"`
Expected: FAIL — `sendCrmLineMessage` ยังไม่มี

- [ ] **Step 3: implement** — แก้ `src/app/(app)/crm/crm-actions.ts`:

เพิ่ม import (บนสุด ต่อจากของเดิม):

```ts
import { pushLineMessage } from "@/lib/line"
import { validateCrmLineText, type CrmListType } from "@/lib/crm"
```

เพิ่ม action ต่อท้ายไฟล์:

```ts
/** ส่งข้อความหาลูกค้าผ่าน OA ไลน์ร้าน แล้วบันทึกผล "ติดต่อแล้ว" อัตโนมัติ
 *  ลำดับกันพลาด: ตรวจ login → ตรวจข้อความ → ตรวจว่าไลน์ผูกกับลูกค้าคนนี้จริง → push → insert
 *  (push ไม่สำเร็จ = ไม่บันทึกอะไรเลย ให้แถวอยู่ในลิสต์ต่อ) */
export async function sendCrmLineMessage(
  customerId: string,
  listType: CrmListType,
  lineUserId: string,
  text: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getMyProfile()
  if (!me) return { ok: false, error: "ยังไม่ได้เข้าสู่ระบบ" }

  const checked = validateCrmLineText(text)
  if (!checked.ok) return checked

  const supabase = await createClient()
  const { data: link } = await supabase
    .from("line_accounts")
    .select("line_user_id")
    .eq("line_user_id", lineUserId)
    .eq("customer_id", customerId)
    .maybeSingle()
  if (!link) return { ok: false, error: "ไลน์นี้ไม่ได้ผูกกับลูกค้าคนนี้" }

  const sent = await pushLineMessage(lineUserId, checked.text)
  if (!sent) return { ok: false, error: "ส่งไลน์ไม่สำเร็จ — ลองใหม่หรือโทรแทนนะคะ" }

  const { error } = await supabase.from("crm_contacts").insert({
    customer_id: customerId,
    list_type: listType,
    result: "contacted",
    note: "ส่งไลน์",
    created_by: me.full_name ?? me.email ?? null,
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath("/crm")
  revalidatePath(`/customers/${customerId}`)
  return { ok: true }
}
```

หมายเหตุ: `saveCrmContact` เดิมประกาศ type `listType` เป็น union ตรงๆ — เปลี่ยนให้ใช้ `CrmListType` ด้วยได้ (ค่าเดียวกันเป๊ะ) แต่ห้ามเปลี่ยนพฤติกรรม

- [ ] **Step 4: รันเทสต์ผ่าน**

Run: `npx vitest run "src/app/(app)/crm/crm-actions.test.ts"`
Expected: PASS 5 ข้อ

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/crm/crm-actions.ts" "src/app/(app)/crm/crm-actions.test.ts"
git commit -m "feat(crm): server action ส่งไลน์หาลูกค้า + บันทึกผลอัตโนมัติ"
```

---

### Task 3: หน้า /crm ดึง line_accounts → แนบ lineUserId เข้าแถว

**Files:**
- Modify: `src/app/(app)/crm/page.tsx`
- Modify: `src/app/(app)/crm/crm-list.tsx` (เฉพาะ type `CrmRow`)

**Interfaces:**
- Produces: `CrmRow` มี field ใหม่ `lineUserId?: string` — Task 4 ใช้ตัดสินว่าโชว์ปุ่มส่งไลน์ไหม

- [ ] **Step 1: เพิ่ม field ใน type** — `crm-list.tsx`:

```ts
export type CrmRow = {
  customerId: string
  name: string
  nickname: string | null
  phone: string
  /** เหตุผลที่ขึ้นลิสต์ เช่น "วันเกิดพรุ่งนี้" / "หายไป 74 วัน · ยอดสะสม 5,200฿" */
  reason: string
  /** มีค่า = ลูกค้าเคยผูกไลน์ → โชว์ปุ่มส่งไลน์ (ผูกหลายไลน์ใช้ตัวล่าสุด) */
  lineUserId?: string
}
```

- [ ] **Step 2: ดึง + map ใน page.tsx**

เพิ่ม query ที่ 5 เข้า `Promise.all` เดิม (ต่อท้าย array):

```ts
      supabase
        .from("line_accounts")
        .select("line_user_id, customer_id, created_at")
        .order("created_at", { ascending: true }),
```

รับผลเพิ่ม: เปลี่ยน destructure เป็น

```ts
  const [{ data: birthdayCustomers }, { data: dormant }, { data: newcomers }, { data: recentContacts }, { data: lineAccounts }] =
```

สร้าง map หลัง `const contacted = ...` (เรียง ascending แล้ว set ทับ = ตัวล่าสุดชนะ):

```ts
  // ลูกค้าหนึ่งคนอาจผูกหลายไลน์ — เรียงเก่า→ใหม่แล้ว set ทับ เหลือตัวล่าสุด
  const lineByCustomer = new Map<string, string>()
  for (const a of lineAccounts ?? []) {
    if (a.customer_id) lineByCustomer.set(a.customer_id, a.line_user_id)
  }
```

แล้วเติม `lineUserId` ในทั้ง 3 ที่ที่สร้าง `CrmRow` (ใน object ที่มี `customerId` อยู่แล้ว):

- birthdayRows: เพิ่ม `lineUserId: lineByCustomer.get(c.id),`
- winbackRows: เพิ่ม `lineUserId: lineByCustomer.get(c.customer_id!),`
- newRows: เพิ่ม `lineUserId: lineByCustomer.get(c.customer_id!),`

- [ ] **Step 3: ตรวจ type ผ่าน**

Run: `npx tsc --noEmit`
Expected: ไม่มี error (ถ้ามี error อื่นที่มีอยู่ก่อนแล้ว ให้เทียบกับ `git stash && npx tsc --noEmit` ก่อนตัดสิน)

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/crm/page.tsx" "src/app/(app)/crm/crm-list.tsx"
git commit -m "feat(crm): แนบ lineUserId ล่าสุดของลูกค้าเข้าแถวลิสต์"
```

---

### Task 4: ปุ่ม 💬 ส่งไลน์ + dialog แก้ข้อความ

**Files:**
- Modify: `src/app/(app)/crm/crm-list.tsx`

**Interfaces:**
- Consumes: `crmMessage` (Task 1) · `sendCrmLineMessage` (Task 2) · `CrmRow.lineUserId` (Task 3) · `Dialog` จาก `@/components/ui/dialog` · `LINE_MESSAGE_MAX` (Task 1)

- [ ] **Step 1: refactor copyMessage ให้ใช้ crmMessage** — แทนที่ switch เดิมในฟังก์ชัน `copyMessage`:

```ts
  function copyMessage(row: CrmRow) {
    const msg = crmMessage(listType, row.nickname || row.name)
    navigator.clipboard
      .writeText(msg)
      .then(() => toast.success("คัดลอกข้อความแล้ว — ไปวางในไลน์/SMS ได้เลย"))
      .catch(() => toast.error("คัดลอกไม่สำเร็จ"))
  }
```

ปรับ import: เอา `msgBirthday, msgNewFollow, msgWinback` ออก ใส่ `crmMessage, LINE_MESSAGE_MAX` แทน และเพิ่ม `sendCrmLineMessage` จาก `./crm-actions`:

```ts
import { saveCrmContact, sendCrmLineMessage, type ContactResult } from "./crm-actions"
import { crmMessage, LINE_MESSAGE_MAX } from "@/lib/crm"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
```

- [ ] **Step 2: state + ฟังก์ชันส่ง** — ใน `CrmList` เพิ่ม state ต่อจาก `savingId`:

```ts
  // dialog ส่งไลน์: เก็บทั้งแถวที่กำลังจะส่ง + ข้อความที่แก้ได้
  const [lineTarget, setLineTarget] = useState<CrmRow | null>(null)
  const [lineText, setLineText] = useState("")
  const [sending, setSending] = useState(false)

  function openLineDialog(row: CrmRow) {
    setLineTarget(row)
    setLineText(crmMessage(listType, row.nickname || row.name))
  }

  function sendLine() {
    if (!lineTarget?.lineUserId) return
    setSending(true)
    startTransition(async () => {
      const r = await sendCrmLineMessage(
        lineTarget.customerId,
        listType,
        lineTarget.lineUserId,
        lineText
      )
      if (r.ok) {
        toast.success(`ส่งไลน์หา ${lineTarget.nickname || lineTarget.name} แล้ว 💬`)
        setLineTarget(null)
        router.refresh()
      } else {
        toast.error(r.error)
      }
      setSending(false)
    })
  }
```

- [ ] **Step 3: ปุ่มในแถว** — ใน block ปุ่ม (else ของ `openResult`) เพิ่มปุ่มแรกสุด เฉพาะแถวที่มีไลน์:

```tsx
                <div className="flex gap-2">
                  {row.lineUserId && (
                    <Button size="sm" variant="default" onClick={() => openLineDialog(row)}>
                      💬 ส่งไลน์
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => copyMessage(row)}>
                    📋 คัดลอกข้อความ
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setOpenResult(row.customerId)}
                  >
                    ✅ บันทึกผล
                  </Button>
                </div>
```

- [ ] **Step 4: Dialog** — วางก่อนปิด `</ul>` ไม่ได้ (อยู่นอก list ดีกว่า) → ครอบ return เดิมด้วย fragment แล้ววาง Dialog ต่อท้าย `</ul>`:

```tsx
    <>
      <ul className="space-y-2">
        {/* ...ของเดิมทั้งหมด... */}
      </ul>

      <Dialog open={lineTarget !== null} onOpenChange={(o) => !o && setLineTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              ส่งไลน์หา {lineTarget ? lineTarget.nickname || lineTarget.name : ""}
            </DialogTitle>
          </DialogHeader>
          {/* แก้ข้อความได้ก่อนส่ง — ส่งผ่าน OA ร้าน ลูกค้าเห็นเป็นแชทจากร้านทันที */}
          <textarea
            value={lineText}
            onChange={(e) => setLineText(e.target.value)}
            rows={7}
            maxLength={LINE_MESSAGE_MAX}
            className="w-full rounded-md border border-slate-200 p-3 text-sm"
          />
          <p className="text-right text-xs text-slate-400">
            {lineText.length}/{LINE_MESSAGE_MAX}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLineTarget(null)} disabled={sending}>
              ยกเลิก
            </Button>
            <Button onClick={sendLine} disabled={sending || !lineText.trim()}>
              {sending ? "กำลังส่ง..." : "ยืนยันส่ง 💬"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
```

- [ ] **Step 5: ตรวจทั้งโปรเจกต์**

Run: `npx tsc --noEmit && npx vitest run && npm run lint`
Expected: ผ่านทั้งหมด (lint เฉพาะไฟล์ที่แตะ ถ้าโปรเจกต์มี warning เดิมอยู่แล้วไม่นับ)

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/crm/crm-list.tsx"
git commit -m "feat(crm): ปุ่มส่งไลน์ + dialog แก้ข้อความก่อนส่ง"
```

---

### Task 5: build + ทดสอบจริง + merge

- [ ] **Step 1: build ต้องผ่าน**

```bash
export PATH="$HOME/.nvm/versions/node/$(ls ~/.nvm/versions/node | tail -1)/bin:$PATH"
npm run build
```

Expected: build สำเร็จ ไม่มี error

- [ ] **Step 2: E2E มือ (ทำร่วมกับ Boss)** — บน preview/local:
  1. หาลูกค้าทดสอบที่ผูกกับไลน์ Boss อยู่แล้ว (`select * from line_accounts` — memory: DESTINATION_USER_ID ของ Boss คือ `U3c8bfa1d9fae6ace22e61cf3004da27d`) หรือผูกใหม่ผ่านหน้า /book
  2. ปรับข้อมูลลูกค้าทดสอบให้เข้าลิสต์สักประเภท (เช่น ตั้ง birthday ใน 7 วัน)
  3. เปิด /crm → เห็นปุ่ม 💬 ส่งไลน์ → กด → แก้ข้อความ → ยืนยันส่ง
  4. ข้อความเด้งในไลน์ Boss · แถวหายจากลิสต์ · โปรไฟล์ลูกค้าโชว์ประวัติ "ติดต่อแล้ว (ส่งไลน์)"
  5. ลบ/แก้ข้อมูลทดสอบคืน

- [ ] **Step 3: merge + deploy**

```bash
git checkout main && git merge --no-ff feat/crm-line-send -m "merge: ปุ่มส่งไลน์จากศูนย์ดูแลลูกค้า /crm"
npx vercel deploy --prod
```

- [ ] **Step 4: ทดสอบซ้ำบน production 1 รอบ** (ข้อ 2 ย่อ) แล้วแจ้ง Boss ว่าพร้อมใช้
