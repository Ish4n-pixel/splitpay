'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users, Receipt, QrCode, ArrowRight, ShieldCheck, Sparkles, CheckCircle2 } from 'lucide-react';

export default function HomePage() {
  const router = useRouter();
  const [mode, setMode] = useState<'create' | 'join'>('create');

  // Create form state
  const [hostName, setHostName] = useState('');
  const [hostUpiVpa, setHostUpiVpa] = useState('');
  const [tableTitle, setTableTitle] = useState('');
  const [feeMode, setFeeMode] = useState<'proportional' | 'equal'>('proportional');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createError, setCreateError] = useState('');

  // Join form state
  const [joinCode, setJoinCode] = useState('');
  const [guestName, setGuestName] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hostName.trim()) {
      setCreateError('Please enter your name');
      return;
    }
    if (!hostUpiVpa.trim() || !hostUpiVpa.includes('@')) {
      setCreateError('Please enter a valid UPI ID (e.g. rohit@okhdfcbank)');
      return;
    }

    setCreateError('');
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostName: hostName.trim(),
          hostUpiVpa: hostUpiVpa.trim(),
          title: tableTitle.trim() || `${hostName.trim()}'s Table`,
          feeMode,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create table');

      // Store host credentials in localStorage
      localStorage.setItem(`splitpay_host_key_${data.code}`, data.hostKey);
      localStorage.setItem(`splitpay_participant_${data.code}`, JSON.stringify({
        id: data.hostParticipantId,
        token: data.hostParticipantToken,
        name: hostName.trim(),
        isHost: true,
      }));

      // Redirect to host bill setup screen
      router.push(`/s/${data.code}/host/setup`);
    } catch (err: any) {
      setCreateError(err.message || 'Something went wrong');
      setIsSubmitting(false);
    }
  };

  const handleJoinSession = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = joinCode.trim().toUpperCase();
    if (!cleanCode || cleanCode.length < 4) {
      setJoinError('Please enter a valid 6-character code');
      return;
    }
    if (!guestName.trim()) {
      setJoinError('Please enter your name');
      return;
    }

    setJoinError('');
    setIsJoining(true);

    try {
      const res = await fetch(`/api/sessions/${cleanCode}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: guestName.trim() }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to join table');

      localStorage.setItem(`splitpay_participant_${cleanCode}`, JSON.stringify({
        id: data.participantId,
        token: data.token,
        name: guestName.trim(),
        isHost: false,
      }));

      router.push(`/s/${cleanCode}`);
    } catch (err: any) {
      setJoinError(err.message || 'Could not find or join this table');
      setIsJoining(false);
    }
  };

  return (
    <div className="space-y-12">
      {/* Hero Header */}
      <section className="text-center space-y-4 pt-4 sm:pt-8">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-semibold">
          <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
          Smart Group Dining & Bill Settlement
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-900 tracking-tight max-w-2xl mx-auto">
          Fair Itemized Splits, <br className="hidden sm:inline" />
          <span className="text-emerald-600 bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
            One Seamless Payment.
          </span>
        </h1>
        <p className="text-slate-600 text-sm sm:text-base max-w-lg mx-auto leading-relaxed">
          No math chaos. Digitize receipts, diners claim what they ordered,
          collect shares via pooled UPI QR codes, and pay the venue once.
        </p>
      </section>

      {/* Main Interactive Card */}
      <div className="max-w-md mx-auto bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 p-6 sm:p-8">
        {/* Tab switcher */}
        <div className="flex p-1 bg-slate-100 rounded-2xl mb-6">
          <button
            type="button"
            onClick={() => setMode('create')}
            className={`flex-1 py-2.5 text-xs sm:text-sm font-bold rounded-xl transition-all ${
              mode === 'create'
                ? 'bg-white text-emerald-800 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Start a Table (Host)
          </button>
          <button
            type="button"
            onClick={() => setMode('join')}
            className={`flex-1 py-2.5 text-xs sm:text-sm font-bold rounded-xl transition-all ${
              mode === 'join'
                ? 'bg-white text-emerald-800 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Join with Code
          </button>
        </div>

        {mode === 'create' ? (
          <form onSubmit={handleCreateSession} className="space-y-4">
            {createError && (
              <div className="p-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl">
                {createError}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Your Name (Host) *
              </label>
              <input
                type="text"
                placeholder="e.g. Ishan Gupta"
                value={hostName}
                onChange={(e) => setHostName(e.target.value)}
                required
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Your UPI ID (VPA) *
              </label>
              <input
                type="text"
                placeholder="e.g. ishan@okhdfcbank or 9876543210@paytm"
                value={hostUpiVpa}
                onChange={(e) => setHostUpiVpa(e.target.value)}
                required
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent font-mono"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Guests will send their shares directly to this UPI address.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Table Name / Occasion (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Friday Team Dinner"
                value={tableTitle}
                onChange={(e) => setTableTitle(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Taxes & Service Charge Allocation
              </label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setFeeMode('proportional')}
                  className={`p-2.5 text-left rounded-xl border text-xs font-medium transition-all ${
                    feeMode === 'proportional'
                      ? 'border-emerald-500 bg-emerald-50/50 text-emerald-900 ring-1 ring-emerald-500'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <div className="font-bold flex items-center justify-between">
                    Proportional
                    {feeMode === 'proportional' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                  </div>
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    Based on spend (Fair)
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setFeeMode('equal')}
                  className={`p-2.5 text-left rounded-xl border text-xs font-medium transition-all ${
                    feeMode === 'equal'
                      ? 'border-emerald-500 bg-emerald-50/50 text-emerald-900 ring-1 ring-emerald-500'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <div className="font-bold flex items-center justify-between">
                    Equal Split
                    {feeMode === 'equal' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                  </div>
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    Flat split across seats
                  </span>
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-2 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold text-sm shadow-md shadow-emerald-500/20 hover:from-emerald-700 hover:to-teal-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                'Setting up Table...'
              ) : (
                <>
                  Next: Add Receipt
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={handleJoinSession} className="space-y-4">
            {joinError && (
              <div className="p-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl">
                {joinError}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                6-Character Table Code *
              </label>
              <input
                type="text"
                maxLength={6}
                placeholder="e.g. SPLIT9"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                required
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-base font-mono tracking-widest uppercase text-center font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Your Name *
              </label>
              <input
                type="text"
                placeholder="e.g. Priya"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                required
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>

            <button
              type="submit"
              disabled={isJoining}
              className="w-full mt-2 py-3 px-4 rounded-xl bg-emerald-600 text-white font-bold text-sm shadow-md shadow-emerald-500/20 hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isJoining ? (
                'Joining...'
              ) : (
                <>
                  Join Table
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}
      </div>

      {/* Feature Value Props */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-start">
          <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4">
            <Receipt className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-slate-900 text-base mb-1">
            Receipt OCR & Item Claiming
          </h3>
          <p className="text-slate-500 text-xs sm:text-sm leading-relaxed">
            Snap a receipt photo to extract dishes instantly. Friends tap what they ate; shared dishes split automatically.
          </p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-start">
          <div className="h-10 w-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center mb-4">
            <QrCode className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-slate-900 text-base mb-1">
            Pooled UPI QR Codes
          </h3>
          <p className="text-slate-500 text-xs sm:text-sm leading-relaxed">
            Dynamic QR codes pre-filled with each diner&apos;s exact share pay directly to the host&apos;s UPI ID.
          </p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-start">
          <div className="h-10 w-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-slate-900 text-base mb-1">
            Live Settlement Bar
          </h3>
          <p className="text-slate-500 text-xs sm:text-sm leading-relaxed">
            Track incoming payments in real time, mark cash payers, handle proxy covers, and present one payment to the venue.
          </p>
        </div>
      </section>
    </div>
  );
}
