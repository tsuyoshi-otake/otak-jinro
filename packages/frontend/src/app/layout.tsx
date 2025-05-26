import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'otak-jinro - 人狼ゲーム',
  description: 'リアルタイムオンライン人狼ゲーム',
  keywords: ['人狼', 'ゲーム', 'オンライン', 'マルチプレイヤー'],
  authors: [{ name: 'SystemExe Research and Development' }],
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Single Page Apps for GitHub Pages
              (function(l) {
                if (l.search[1] === '/' ) {
                  var decoded = l.search.slice(1).split('&').map(function(s) {
                    return s.replace(/~and~/g, '&')
                  }).join('?');
                  window.history.replaceState(null, null,
                      l.pathname.slice(0, -1) + decoded + l.hash
                  );
                }
              }(window.location))
            `,
          }}
        />
      </head>
      <body className={inter.className}>
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
          <div
            className="absolute inset-0 bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]"
            style={{
              backgroundImage: `url('${process.env.NODE_ENV === 'production' ? '/otak-jinro' : ''}/grid.svg')`
            }}
          />
          <div className="relative">
            {children}
          </div>
        </div>
      </body>
    </html>
  )
}