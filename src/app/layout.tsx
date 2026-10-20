import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SplitPay — Smart Group Dining & Fair Splits',
  description: 'Smart group dining, fair itemized splits, one seamless payment.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased selection:bg-emerald-500 selection:text-white">
        <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/80 backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
            <a href="/" className="flex items-center gap-2 group">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-sm font-bold text-lg group-hover:scale-105 transition-transform">
                ₹
              </div>
              <div className="flex flex-col">
                <span className="font-extrabold tracking-tight text-slate-900 text-lg leading-tight">
                  Split<span className="text-emerald-600">Pay</span>
                </span>
                <span className="text-[10px] text-slate-500 font-medium -mt-0.5">
                  Fair dining splits
                </span>
              </div>
            </a>
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200/60">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Live Table
              </span>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-6 sm:py-8">{children}</main>
      </body>
    </html>
  );
}
