'use client';

import { useState, useEffect } from 'react';
import { Smartphone, Download, Share2, PlusSquare, X, Check, Sparkles } from 'lucide-react';
import { getCookie, setCookie } from '@/lib/cookies';

export function PwaWidgetPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    // Check if already running in standalone PWA / Home Screen mode
    const inStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    setIsStandalone(inStandalone);

    // Detect mobile device
    const userAgent = window.navigator.userAgent || '';
    const mobileCheck = /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
    setIsMobile(mobileCheck);

    // Detect iOS
    const iosCheck = /iPad|iPhone|iPod/.test(userAgent) && !(window as any).MSStream;
    setIsIos(iosCheck);

    // Register Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('PWA ServiceWorker registration failed:', err);
      });
    }

    // Capture Android beforeinstallprompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // If user hasn't dismissed before and not in standalone, show banner on mobile
      const dismissed = getCookie('splitpay_pwa_dismissed');
      if (!dismissed && !inStandalone) {
        setShowBanner(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // On iOS Safari, show prompt banner if not standalone and not dismissed
    if (iosCheck && !inStandalone) {
      const dismissed = getCookie('splitpay_pwa_dismissed');
      if (!dismissed) {
        setShowBanner(true);
      }
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowBanner(false);
        setShowModal(false);
      }
      setDeferredPrompt(null);
    } else {
      setShowModal(true);
    }
  };

  const handleDismissBanner = () => {
    setShowBanner(false);
    // Don't show banner for 14 days
    setCookie('splitpay_pwa_dismissed', 'true', 14 * 86400);
  };

  if (isStandalone) {
    return null; // Already running as home screen widget!
  }

  return (
    <>
      {/* Header Quick Button */}
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold border border-emerald-200/70 transition-colors shadow-xs"
        title="Add SplitPay as a widget on your mobile home screen"
      >
        <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
        <span className="hidden sm:inline">Add to Home Screen</span>
        <span className="sm:hidden">App Widget</span>
      </button>

      {/* Floating Bottom Banner on Mobile for first-time visitors */}
      {showBanner && !showModal && (
        <div className="fixed bottom-4 left-4 right-4 z-40 max-w-md mx-auto bg-slate-900/95 backdrop-blur-md text-white p-3 sm:p-3.5 rounded-2xl shadow-2xl border border-slate-700/50 flex items-center justify-between gap-3 animate-in slide-in-from-bottom duration-300">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center font-bold text-sm sm:text-base shadow-sm shrink-0">
              ₹
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-bold leading-tight truncate">Install SplitPay Widget</span>
              <span className="text-[10px] sm:text-[11px] text-slate-400 truncate">1-tap access on your home screen</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleInstallClick}
              className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm transition-colors whitespace-nowrap"
            >
              Add Widget
            </button>
            <button
              type="button"
              onClick={handleDismissBanner}
              className="p-1 rounded-lg text-slate-400 hover:text-white transition-colors"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Instructional Modal - Protected against top/bottom clipping on mobile viewports */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm p-3 sm:p-4 flex flex-col justify-start sm:justify-center items-center min-h-[100dvh]"
          style={{
            paddingTop: 'max(1rem, env(safe-area-inset-top, 1rem))',
            paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowModal(false);
          }}
        >
          <div className="relative w-full max-w-sm my-auto bg-white rounded-3xl shadow-2xl border border-slate-100 flex flex-col max-h-[calc(100dvh-2.5rem)] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header - Fixed at Top */}
            <div className="p-4 sm:p-5 pb-3 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-base shrink-0">
                  ₹
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900 leading-tight">
                    Add SplitPay Widget
                  </h3>
                  <p className="text-[10px] text-slate-500">Fast 1-tap dining & bill splits</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body - Scrollable if screen is compact */}
            <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-3.5">
              {isIos ? (
                /* iOS Safari Instructions */
                <div className="space-y-3 bg-slate-50 p-3.5 sm:p-4 rounded-2xl border border-slate-100">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                      1
                    </div>
                    <div className="text-xs text-slate-700 leading-snug">
                      Tap the <strong className="text-slate-900">Share</strong> icon in the bottom menu bar of Safari:
                      <div className="mt-1 flex items-center gap-1.5 font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg w-fit border border-emerald-200/50">
                        <Share2 className="w-3.5 h-3.5" />
                        <span>Share</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                      2
                    </div>
                    <div className="text-xs text-slate-700 leading-snug">
                      Scroll down and tap:
                      <div className="mt-1 flex items-center gap-1.5 font-semibold text-slate-800 bg-white px-2.5 py-1 rounded-lg w-fit border border-slate-200 shadow-2xs">
                        <PlusSquare className="w-3.5 h-3.5 text-slate-600" />
                        <span>Add to Home Screen</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                      3
                    </div>
                    <div className="text-xs text-slate-700 leading-snug">
                      Tap <strong className="text-slate-900">Add</strong> in the top right corner. SplitPay will appear directly on your home screen!
                    </div>
                  </div>
                </div>
              ) : deferredPrompt ? (
                /* Android with native prompt ready */
                <div className="space-y-4 text-center py-1">
                  <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 space-y-2">
                    <Sparkles className="w-7 h-7 text-emerald-600 mx-auto" />
                    <p className="text-xs text-slate-700 leading-relaxed font-medium">
                      Install SplitPay onto your phone&apos;s home screen for instant 1-tap launch, native app performance, and offline bill review.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleInstallClick}
                    className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-colors flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Install Home Screen Widget
                  </button>
                </div>
              ) : (
                /* Chrome/Android manual guide */
                <div className="space-y-3 bg-slate-50 p-3.5 sm:p-4 rounded-2xl border border-slate-100">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                      1
                    </div>
                    <div className="text-xs text-slate-700 leading-snug">
                      Tap the <strong className="text-slate-900">Chrome menu</strong> (three dots ⋮ in top right).
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                      2
                    </div>
                    <div className="text-xs text-slate-700 leading-snug">
                      Select <strong className="text-slate-900">&quot;Install app&quot;</strong> or <strong className="text-slate-900">&quot;Add to Home screen&quot;</strong>.
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                      3
                    </div>
                    <div className="text-xs text-slate-700 leading-snug">
                      SplitPay will be placed right on your phone&apos;s home screen like an app widget!
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer - Fixed at Bottom */}
            <div className="p-3 sm:p-4 border-t border-slate-100 bg-slate-50/70 shrink-0 flex justify-end">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="w-full py-2.5 rounded-xl bg-slate-200/80 hover:bg-slate-300 text-slate-700 text-xs font-bold transition-colors"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
