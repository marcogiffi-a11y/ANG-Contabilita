import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ANG Contabilità',
  description: 'Gestionale contabilità Athena Next Gen',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  )
}
