import React from "react"
import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: 'TaskChain',
  description: 'Web3-powered freelance marketplace with escrow-based payments on Stellar blockchain. Protect your work and payments with smart contract security.',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/assets/logo2.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/assets/logo2.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/assets/logo2.png',
        type: 'image/svg+xml',
      },
    ],
    apple: '/assets/logo2.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`font-sans antialiased`}>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
