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
        if (!idToken) {
          // auto-login แบบเงียบอาจไม่ได้ idToken (ยังไม่เคย consent openid กับ channel นี้)
          // → บังคับ login ใหม่ 1 ครั้งให้หน้าขออนุญาตเด้ง · กัน loop ด้วย sessionStorage
          if (!sessionStorage.getItem("liff_relogin")) {
            sessionStorage.setItem("liff_relogin", "1")
            liff.logout()
            liff.login()
            return
          }
          throw new Error("no token after relogin")
        }
        sessionStorage.removeItem("liff_relogin")
        if (!cancelled) setState({ phase: "ready", idToken })
      } catch (e) {
        console.error("liff init failed:", e)
        // แนบสาเหตุจริงไว้ท้ายข้อความ ช่วยวินิจฉัยตอนซัพพอร์ตลูกค้า/ตั้งค่า LIFF
        const detail = e instanceof Error ? e.message : String(e)
        if (!cancelled)
          setState({
            phase: "error",
            message: `เปิดหน้านี้จากเมนูในไลน์ของร้านนะคะ (${detail})`,
          })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])
  return state
}
