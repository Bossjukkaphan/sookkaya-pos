"use client"

import { useEffect, useState } from "react"
import liff from "@line/liff"

export type LiffState =
  | { phase: "loading" }
  | { phase: "ready"; idToken: string }
  | { phase: "error"; message: string }

/** init LIFF ครั้งเดียว → ได้ idToken สำหรับแนบทุก server action */
export function useLiff(): LiffState {
  const [state, setState] = useState<LiffState>({ phase: "loading" })
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID! })
        if (!liff.isLoggedIn()) {
          liff.login()
          return
        }
        const idToken = liff.getIDToken()
        if (!idToken) throw new Error("no token")
        if (!cancelled) setState({ phase: "ready", idToken })
      } catch {
        if (!cancelled)
          setState({ phase: "error", message: "เปิดหน้านี้จากเมนูในไลน์ของร้านนะคะ" })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])
  return state
}
