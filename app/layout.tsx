import React from "react"
import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { Toaster } from 'sonner'
import './globals.css'
import { ThemeProvider } from "@/components/theme-provider" 

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
    <html lang="en" suppressHydrationWarning>
      <body className={`font-sans antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster richColors position="top-right" />
          <Analytics />
        </ThemeProvider>
      </body>
    </html>
  )
}
