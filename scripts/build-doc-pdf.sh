#!/usr/bin/env bash
# แปลงคู่มือ Markdown เป็น PDF ภาษาไทย — ใช้ pandoc + Chromium headless
#
# ทำไมไม่ใช้ LaTeX: เครื่อง build ไม่มี xelatex และฟอนต์ไทยตัวเดียวที่ติดมาคือ Loma
# เส้นทาง HTML → Chromium จึงคุมหน้าตาได้ด้วย CSS ธรรมดา และได้อีโมจิสีจาก Noto Color Emoji
#
# ใช้งาน: scripts/build-doc-pdf.sh docs/ops/ชื่อไฟล์.md
set -euo pipefail
export LANG=C.UTF-8 LC_ALL=C.UTF-8

src="${1:?ใส่พาธไฟล์ .md ด้วย}"
dir="$(dirname "$src")"
out="${src%.md}.pdf"
css="$dir/pdf.css"
[ -f "$css" ] || { echo "ไม่พบ $css"; exit 1; }

chrome=/opt/pw-browsers/chromium-1194/chrome-linux/chrome
[ -x "$chrome" ] || chrome="$(command -v chromium || command -v google-chrome)"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
cp "$css" "$tmp/pdf.css"

pandoc -f gfm -t html5 --standalone \
  --metadata title="คู่มือพนักงานต้อนรับ · สุขกายา POS" \
  -c pdf.css "$src" -o "$tmp/doc.html"

"$chrome" --headless --no-sandbox --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="$tmp/doc.pdf" "file://$tmp/doc.html" 2>/dev/null

cp "$tmp/doc.pdf" "$out"
echo "เขียน $out แล้ว"
