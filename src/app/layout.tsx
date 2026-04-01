import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'SOOKKAYA POS',
  description: 'ระบบ POS ร้านนวดสุขกายา',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-full bg-gray-50 text-gray-900">{children}</body>
    </html>
  )
}
