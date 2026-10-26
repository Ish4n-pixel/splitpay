'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Users,
  QrCode,
  Copy,
  Check,
  CheckCircle2,
  XCircle,
  Banknote,
  ShieldCheck,
  Percent,
  Plus,
  Share2,
  ExternalLink,
  AlertTriangle,
  Loader2,
  Receipt,
  UserCheck,
  Lock,
} from 'lucide-react';
import { useSessionSocket } from '@/lib/useSessionSocket';
import { formatINR, toRupees } from '@/lib/money';
import { buildUpiUri } from '@/lib/upi';
import { ChargeKind, ChargeBasis } from '@/lib/split/engine';
import { saveRecentTable } from '@/lib/cookies';

export default function HostDashboardPage() {
  const params = useParams();
  const router = useRouter();
  const code = (params.code as string)?.toUpperCase();

  const [hostKey, setHostKey] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [selectedQrDinerId, setSelectedQrDinerId] = useState<string | null>(null);
  const [customTipRupees, setCustomTipRupees] = useState<string>('');
  const [showTipModal, setShowTipModal] = useState(false);
  const [showAddChargeModal, setShowAddChargeModal] = useState(false);
  const [chargeKind, setChargeKind] = useState<ChargeKind>('tax');
  const [chargeLabel, setChargeLabel] = useState('GST 5%');
  const [chargeBasis, setChargeBasis] = useState<ChargeBasis>('percent');
  const [chargeValueStr, setChargeValueStr] = useState('5');

  const { snapshot, connected, error, actions } = useSessionSocket(code);

  useEffect(() => {
    const key = localStorage.getItem(`splitpay_host_key_${code}`);
    if (key) {
      setHostKey(key);
    }
    saveRecentTable({
      code,
      role: 'host',
    });
  }, [code]);

  useEffect(() => {
    if (snapshot?.session?.title) {
      saveRecentTable({
        code,
        title: snapshot.session.title,
        hostName: snapshot.session.hostUpiName,
        role: 'host',
      });
    }
  }, [code, snapshot?.session?.title, snapshot?.session?.hostUpiName]);

  if (!snapshot) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
        <p className="text-xs text-slate-500 font-medium">Loading live table...</p>
      </div>
    );
  }

  const { session, participants, items, split, progress } = snapshot;

  // Construct table join URL for guests
  const guestJoinUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/s/${session.code}`
    : `http://localhost:3000/s/${session.code}`;

  const handleCopyLink = () => {
    if (typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(guestJoinUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const handleAddTip = (rupees: number) => {
    actions.addCharge(hostKey, {
      kind: 'tip',
      label: `Tip (₹${rupees})`,
      basis: 'fixed',
      value: rupees * 100,
    });
    setShowTipModal(false);
    setCustomTipRupees('');
  };

  const hostParticipant = participants.find((p) => p.isHost);
  const hostShare = hostParticipant
    ? split.shares.find((s) => s.participantId === hostParticipant.id)
    : null;

  const handleHostPortionChange = (itemId: string, newPortion: number) => {
    if (!hostParticipant) return;
    actions.setClaimPortion(itemId, hostParticipant.id, newPortion, undefined, hostKey);
  };

  const handleHostClaimAllRemaining = (itemId: string, remainingQty: number, currentHostQty: number) => {
    if (!hostParticipant) return;
    actions.setClaimPortion(itemId, hostParticipant.id, currentHostQty + remainingQty, undefined, hostKey);
  };

  const handleAddCustomCharge = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hostKey) return;
    const num = parseFloat(chargeValueStr) || 0;
    if (num <= 0) return;

    const finalVal = chargeBasis === 'percent' ? num : Math.round(num * 100);

    actions.addCharge(hostKey, {
      kind: chargeKind,
      label: chargeLabel.trim() || `${chargeKind.toUpperCase()} ${chargeBasis === 'percent' ? `${num}%` : `₹${num}`}`,
      basis: chargeBasis,
      value: finalVal,
    });

    setShowAddChargeModal(false);
    setChargeValueStr('');
  };

  const selectedDinerShare = selectedQrDinerId
    ? split.shares.find((s) => s.participantId === selectedQrDinerId)
    : null;

  const dinerUpiUri = selectedDinerShare
    ? buildUpiUri({
        vpa: session.hostUpiVpa,
        name: session.hostUpiName,
        amountPaise: selectedDinerShare.amountDue,
        note: `SplitPay Table ${session.code}`,
      })
    : '';

  return (
    <div className="space-y-8 max-w-3xl mx-auto pb-12">
      {/* Table Header & Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200/50">
              Host Live Dashboard
            </span>
            <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-2">
            {session.title}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Host: <span className="font-semibold text-slate-700">{session.hostUpiName}</span> ({session.hostUpiVpa})
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/s/${session.code}`}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-xs font-bold text-emerald-800 border border-emerald-200/50 transition-all shadow-sm"
          >
            🍽️ Claim Dishes
          </a>
          <a
            href={`/s/${session.code}/host/setup`}
            className="px-3 py-2 rounded-xl border border-slate-200 hover:border-slate-300 bg-white text-xs font-bold text-slate-700 shadow-sm transition-all"
          >
            Edit Bill
          </a>
          <a
            href={`/s/${session.code}/receipt`}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-800 transition-all"
          >
            <Receipt className="w-3.5 h-3.5" />
            Full Transparency
          </a>
        </div>
      </div>

      {/* Missing Host Key Banner */}
      {!hostKey && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Host management key not found on this device. Paste host key to enable verification:</span>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Paste Host Key"
              onChange={(e) => {
                const k = e.target.value.trim();
                if (k) {
                  setHostKey(k);
                  localStorage.setItem(`splitpay_host_key_${code}`, k);
                }
              }}
              className="px-3 py-1.5 rounded-lg border border-amber-300 font-mono text-xs bg-white text-slate-800 focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* Socket Error Banner */}
      {error && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {/* Live Settlement Progress Card */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-100 shadow-sm space-y-5">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
              Settlement Progress
            </h2>
            <p className="text-xs text-slate-500">
              {progress.settledPercent}% Collected ({formatINR(progress.totalSettledPaise)} of {formatINR(split.grandTotal)})
            </p>
          </div>
          <div className="text-right">
            <span className="text-xl sm:text-2xl font-black font-mono text-emerald-600">
              {formatINR(progress.totalSettledPaise)}
            </span>
            <span className="text-xs text-slate-400 block">pooled of {formatINR(split.grandTotal)}</span>
          </div>
        </div>

        {/* Multi-segment Progress Bar */}
        <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden flex p-0.5 border border-slate-200/50">
          {/* Settled Green */}
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-500"
            style={{ width: `${progress.settledPercent}%` }}
          />
          {/* Pending Amber */}
          {split.grandTotal > 0 && progress.totalPendingPaise > 0 && (
            <div
              className="h-full bg-amber-400 rounded-full ml-0.5 transition-all duration-500 animate-pulse"
              style={{ width: `${Math.round((progress.totalPendingPaise / split.grandTotal) * 100)}%` }}
            />
          )}
        </div>

        {/* Legend */}
        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Settled: {formatINR(progress.totalSettledPaise)}
            </span>
            {progress.totalPendingPaise > 0 && (
              <span className="flex items-center gap-1.5 text-amber-700 font-semibold">
                <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
                Awaiting Verification: {formatINR(progress.totalPendingPaise)}
              </span>
            )}
          </div>
          <span>Unpaid: {formatINR(progress.totalUnpaidPaise)}</span>
        </div>

        {/* 100% Fully Settled Celebration Banner */}
        {progress.isFullySettled && (
          <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center font-bold text-xl">
                🎉
              </div>
              <div>
                <h4 className="font-extrabold text-sm">All Funds Pooled! (100%)</h4>
                <p className="text-xs text-emerald-100">
                  You have collected {formatINR(progress.totalSettledPaise)}. Present 1 single payment to the venue.
                </p>
              </div>
            </div>
            <span className="text-xs font-bold uppercase tracking-wider bg-white text-emerald-800 px-3 py-1 rounded-full shadow-sm">
              Ready to Pay Venue
            </span>
          </div>
        )}
      </div>

      {/* Unclaimed Items Alert Banner with Host Quick-Claim */}
      {!progress.allClaimed && (
        <div className="p-5 rounded-3xl bg-amber-50/90 border border-amber-200/90 text-amber-950 text-xs space-y-3 shadow-sm">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-sm text-amber-900 block">
                {split.unclaimedItems.length} dish{split.unclaimedItems.length > 1 ? 'es' : ''} still need claiming
              </span>
              <p className="text-amber-700 mt-0.5">
                Every dish on the receipt must be claimed before the table can reach 100% final settlement.
              </p>
            </div>
          </div>

          {/* Quick host verification buttons */}
          {hostParticipant && (
            <div className="pt-2 border-t border-amber-200/60">
              <span className="font-bold text-[11px] uppercase tracking-wider text-amber-800 block mb-2">
                ⚡ Quick Host Claim: Did you eat any of these?
              </span>
              <div className="space-y-2">
                {split.unclaimedItems.map((u) => {
                  const item = items.find((i) => i.id === u.id);
                  const hostClaim = item?.claims?.find((c) => c.participantId === hostParticipant.id);
                  const hostPortion = hostClaim?.weight || 0;
                  const remainingQty = u.unclaimedQuantity || 1;

                  return (
                    <div
                      key={u.id}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-white/80 border border-amber-200/80 gap-3"
                    >
                      <div>
                        <span className="font-semibold text-slate-900 text-xs block">
                          {remainingQty > 1 ? `${remainingQty}× ` : ''}{u.name}
                        </span>
                        <span className="text-[10px] text-amber-700 font-mono">
                          {formatINR(u.totalPaise)} unclaimed
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleHostPortionChange(u.id, hostPortion + 1)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] transition-colors shadow-sm"
                        >
                          + Claim 1 for Host
                        </button>
                        {remainingQty > 1 && (
                          <button
                            type="button"
                            onClick={() => handleHostClaimAllRemaining(u.id, remainingQty, hostPortion)}
                            className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-[11px] transition-colors"
                          >
                            Claim All ({remainingQty}×)
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Join & Invite Card */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-100 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="p-2 bg-slate-50 border border-slate-200 rounded-2xl shrink-0">
            {/* Server-generated Join QR code */}
            <img
              src={`/api/qr?text=${encodeURIComponent(guestJoinUrl)}`}
              alt="Join QR Code"
              className="w-24 h-24 rounded-lg object-contain"
            />
          </div>
          <div className="space-y-1">
            <span className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">
              Scan to Join Table
            </span>
            <div className="text-2xl font-black font-mono tracking-widest text-slate-900">
              {session.code}
            </div>
            <p className="text-xs text-slate-500 max-w-xs">
              No app download required. Friends scan or open link to claim their dishes.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleCopyLink}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-all shrink-0 w-full sm:w-auto justify-center"
        >
          {copiedLink ? (
            <>
              <Check className="w-4 h-4 text-emerald-600" />
              Link Copied!
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              Copy Guest Link
            </>
          )}
        </button>
      </div>

      {/* Diners & Settlements Section */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-100 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              Diners & Settlements ({participants.length})
            </h2>
            <p className="text-xs text-slate-500">
              Verify incoming UPI transfers, log cash, or cover friends.
            </p>
          </div>

          {/* Fee Mode & Tip Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                actions.setFeeMode(
                  hostKey,
                  session.feeMode === 'proportional' ? 'equal' : 'proportional'
                )
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 hover:border-slate-300 text-xs font-semibold text-slate-700 transition-all bg-white"
            >
              <Percent className="w-3.5 h-3.5 text-emerald-600" />
              Fees: <span className="font-bold capitalize">{session.feeMode}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setChargeKind('tax');
                setChargeLabel('GST 5%');
                setChargeBasis('percent');
                setChargeValueStr('5');
                setShowAddChargeModal(true);
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-50 text-blue-800 hover:bg-blue-100 text-xs font-semibold transition-all border border-blue-200/50"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Tax / Fee
            </button>

            <button
              type="button"
              onClick={() => setShowTipModal(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 hover:bg-emerald-100 text-xs font-semibold transition-all border border-emerald-200/50"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Tip
            </button>
          </div>
        </div>

        {/* Diners Cards List */}
        <div className="space-y-3">
          {participants.map((p) => {
            const share = split.shares.find((s) => s.participantId === p.id);
            const amountDue = share?.amountDue || 0;
            const isCovered = !!p.coveredBy;
            const covererName = isCovered
              ? participants.find((part) => part.id === p.coveredBy)?.name
              : null;

            return (
              <div
                key={p.id}
                className="p-4 rounded-2xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                {/* Diner Info */}
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-2xl bg-gradient-to-tr from-slate-200 to-slate-100 text-slate-700 font-extrabold flex items-center justify-center text-sm shadow-sm border border-slate-200/60">
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900">
                        {p.name}
                      </span>
                      {p.isHost && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          Host
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                      <span>{share?.items.length || 0} items claimed</span>
                      {isCovered && (
                        <span className="text-indigo-600 font-medium">
                          • Covered by {covererName}
                        </span>
                      )}
                      {share && share.coveredParticipantIds.length > 0 && (
                        <span className="text-indigo-600 font-medium">
                          • Covering {share.coveredParticipantIds.length} friend{share.coveredParticipantIds.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Amount & Actions */}
                <div className="flex items-center justify-between sm:justify-end gap-3 border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-200">
                  <div className="text-right">
                    <span className="font-mono font-extrabold text-base text-slate-900 block">
                      {isCovered ? '₹0.00' : formatINR(amountDue)}
                    </span>
                    {/* Status Badge */}
                    <div>
                      {p.payStatus === 'paid_upi' && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-md">
                          <CheckCircle2 className="w-3 h-3" />
                          Paid (UPI)
                        </span>
                      )}
                      {p.payStatus === 'paid_cash' && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-md">
                          {p.isHost ? (
                            <>
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              Host Share (Committed)
                            </>
                          ) : (
                            <>
                              <Banknote className="w-3 h-3" />
                              Paid (Cash)
                            </>
                          )}
                        </span>
                      )}
                      {p.payStatus === 'partially_paid' && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-md">
                          <AlertTriangle className="w-3 h-3" />
                          Partially Paid (Paid {formatINR(p.paidAmountPaise)})
                        </span>
                      )}
                      {p.payStatus === 'pending_verify' && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md animate-pulse">
                          Awaiting Verify
                        </span>
                      )}
                      {p.payStatus === 'unpaid' && !isCovered && (
                        <span className="text-[11px] font-semibold text-slate-400">
                          Unpaid
                        </span>
                      )}
                      {isCovered && (
                        <span className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                          Covered
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Host Action Buttons */}
                  <div className="flex items-center gap-1.5">
                    {/* If diner tapped 'I have paid', Host sees Verify / Reject */}
                    {p.payStatus === 'pending_verify' && (
                      <>
                        <button
                          type="button"
                          onClick={() => actions.verifyPayment(hostKey, p.id)}
                          title="Verify UPI Payment"
                          className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm flex items-center gap-1 transition-colors"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Verify
                        </button>
                        <button
                          type="button"
                          onClick={() => actions.rejectPayment(hostKey, p.id)}
                          title="Reject"
                          className="p-1.5 rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </>
                    )}

                    {/* Paid Cash Toggle Button */}
                    <button
                      type="button"
                      onClick={() =>
                        actions.toggleCashPayment(
                          hostKey,
                          p.id,
                          p.payStatus !== 'paid_cash'
                        )
                      }
                      title="Toggle Cash Payment"
                      className={`p-2 rounded-xl text-xs font-semibold transition-colors ${
                        p.payStatus === 'paid_cash'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                      }`}
                    >
                      <Banknote className="w-4 h-4" />
                    </button>

                    {/* Show Personal UPI QR Code Button */}
                    {amountDue > 0 && !isCovered && (
                      <button
                        type="button"
                        onClick={() => setSelectedQrDinerId(p.id)}
                        title="Show Diner UPI QR Code"
                        className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                      >
                        <QrCode className="w-4 h-4" />
                      </button>
                    )}

                    {/* Proxy Cover Selector Dropdown */}
                    {!p.isHost && (
                      <select
                        value={p.coveredBy || ''}
                        onChange={(e) =>
                          actions.setProxyCover(
                            hostKey,
                            p.id,
                            e.target.value || null
                          )
                        }
                        className="text-[11px] font-medium rounded-xl border border-slate-200 bg-white py-1.5 px-2 text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      >
                        <option value="">Not covered (Self)</option>
                        {participants
                          .filter((part) => part.id !== p.id)
                          .map((part) => (
                            <option key={part.id} value={part.id}>
                              Covered by {part.name}
                            </option>
                          ))}
                      </select>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bill Items & Claims Matrix */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-100 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Receipt Items & Claimants ({items.length})
            </h2>
            <p className="text-xs text-slate-500">
              Verify dishes you ate or adjust guest portions directly.
            </p>
          </div>
          {hostParticipant && (
            <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200/60 px-3 py-1 rounded-xl">
              Host Share: {hostShare ? formatINR(hostShare.amountDue) : '₹0.00'}
            </span>
          )}
        </div>

        <div className="divide-y divide-slate-100">
          {items.map((item) => {
            const hostClaim = item.claims?.find((c) => c.participantId === hostParticipant?.id);
            const hostPortion = hostClaim?.weight || 0;
            const otherClaims = (item.claims || []).filter((c) => c.participantId !== hostParticipant?.id && c.weight > 0);
            const totalClaimed = (item.claims || []).reduce((acc, c) => acc + c.weight, 0);
            const remaining = Math.max(0, item.quantity - totalClaimed);
            const isOrphan = totalClaimed === 0;

            return (
              <div
                key={item.id}
                className={`py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  isOrphan ? 'bg-amber-50/50 -mx-3 px-3 rounded-xl' : ''
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-xs sm:text-sm text-slate-900">
                      {item.quantity > 1 ? `${item.quantity}× ` : ''}
                      {item.name}
                    </span>
                    {isOrphan && (
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                        Unclaimed
                      </span>
                    )}
                    {remaining > 0 && !isOrphan && (
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-100/80 px-1.5 py-0.5 rounded">
                        {remaining} of {item.quantity} Unclaimed
                      </span>
                    )}
                    {remaining === 0 && (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                        All Claimed ✓
                      </span>
                    )}
                  </div>

                  {/* Claimant breakdown */}
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-[11px]">
                    {hostPortion > 0 && (
                      <span className="inline-flex items-center gap-1 font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-300">
                        👑 You (Host): {hostPortion}×
                      </span>
                    )}
                    {otherClaims.map((oc) => {
                      const claimant = participants.find((p) => p.id === oc.participantId);
                      return (
                        <span
                          key={oc.participantId}
                          className="inline-flex items-center gap-1 font-medium bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                          {claimant?.name}: {oc.weight}×
                        </span>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                  {/* Host Quick Claim Stepper */}
                  {hostParticipant && (
                    <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
                      <span className="text-[10px] font-bold text-slate-500 uppercase px-1">
                        Host:
                      </span>
                      {hostPortion > 0 ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleHostPortionChange(item.id, hostPortion - 1)}
                            className="h-6 w-6 rounded-lg bg-white hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center shadow-sm"
                          >
                            -
                          </button>
                          <span className="font-mono font-bold text-xs px-1 text-slate-800">
                            {hostPortion}
                          </span>
                          <button
                            type="button"
                            disabled={remaining <= 0}
                            onClick={() => handleHostPortionChange(item.id, hostPortion + 1)}
                            className="h-6 w-6 rounded-lg bg-white hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center shadow-sm disabled:opacity-30"
                          >
                            +
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={remaining <= 0}
                          onClick={() => handleHostPortionChange(item.id, 1)}
                          className="px-2 py-1 rounded-lg bg-white hover:bg-emerald-50 text-emerald-800 border border-slate-200 font-bold text-[11px] shadow-sm transition-colors disabled:opacity-40 disabled:hover:bg-white disabled:cursor-not-allowed flex items-center gap-1"
                        >
                          {remaining <= 0 ? (
                            <>
                              <Lock className="w-3 h-3 text-slate-400" />
                              Claimed
                            </>
                          ) : (
                            '+ I Ate This'
                          )}
                        </button>
                      )}
                    </div>
                  )}

                  <div className="text-right">
                    <span className="font-mono font-bold text-xs sm:text-sm text-slate-900 block">
                      {formatINR(item.totalPaise)}
                    </span>
                    {item.quantity > 1 && (
                      <span className="text-[10px] text-slate-400 block font-mono">
                        {formatINR(Math.round(item.totalPaise / item.quantity))} ea
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Show Diner QR Modal */}
      {selectedQrDinerId && selectedDinerShare && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-sm w-full text-center space-y-4 shadow-2xl">
            <h3 className="font-extrabold text-slate-900 text-lg">
              UPI QR for {selectedDinerShare.participantName}
            </h3>
            <p className="text-xs text-slate-500">
              Hold this up so {selectedDinerShare.participantName} can scan and pay their share directly to {session.hostUpiName}.
            </p>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex justify-center">
              <img
                src={`/api/qr?text=${encodeURIComponent(dinerUpiUri)}`}
                alt="Diner UPI QR"
                className="w-56 h-56 rounded-xl object-contain"
              />
            </div>

            <div className="font-mono text-2xl font-black text-emerald-600">
              {formatINR(selectedDinerShare.amountDue)}
            </div>

            <button
              type="button"
              onClick={() => setSelectedQrDinerId(null)}
              className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-xs text-slate-800 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Tip Modal */}
      {showTipModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-6 max-w-xs w-full text-center space-y-4 shadow-2xl">
            <h3 className="font-bold text-slate-900 text-base">Add Table Tip</h3>
            <p className="text-xs text-slate-500">
              Tip will be shared across diners according to the table fee setting.
            </p>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleAddTip(50)}
                className="py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs transition-colors"
              >
                + ₹50
              </button>
              <button
                type="button"
                onClick={() => handleAddTip(100)}
                className="py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs transition-colors"
              >
                + ₹100
              </button>
              <button
                type="button"
                onClick={() => handleAddTip(200)}
                className="py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs transition-colors"
              >
                + ₹200
              </button>
              <button
                type="button"
                onClick={() => handleAddTip(500)}
                className="py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs transition-colors"
              >
                + ₹500
              </button>
            </div>

            <div className="flex gap-2 pt-1 border-t border-slate-100">
              <input
                type="number"
                placeholder="Custom ₹"
                value={customTipRupees}
                onChange={(e) => setCustomTipRupees(e.target.value)}
                className="flex-1 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <button
                type="button"
                onClick={() => {
                  const val = parseFloat(customTipRupees);
                  if (val > 0) handleAddTip(val);
                }}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors"
              >
                Add
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowTipModal(false)}
              className="w-full py-2 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-xs text-slate-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Add Charge / Tax Modal */}
      {showAddChargeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <form
            onSubmit={handleAddCustomCharge}
            className="bg-white rounded-3xl p-6 sm:p-8 max-w-sm w-full space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-base">Add Tax, Service Charge or Fee</h3>
              <button
                type="button"
                onClick={() => setShowAddChargeModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Charge will be distributed among diners according to the table fee mode ({session.feeMode}).
            </p>

            {/* Kind Selector */}
            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">
                Charge Type
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {(['tax', 'service', 'tip', 'discount'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      setChargeKind(k);
                      if (k === 'tax') setChargeLabel('GST 5%');
                      else if (k === 'service') setChargeLabel('Service Charge 10%');
                      else if (k === 'tip') setChargeLabel('Tip');
                      else setChargeLabel('Discount');
                    }}
                    className={`py-2 px-3 rounded-xl text-xs font-bold capitalize transition-all border ${
                      chargeKind === k
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300 shadow-sm'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {k === 'tax' ? 'GST / Tax' : k === 'service' ? 'Service Charge' : k}
                  </button>
                ))}
              </div>
            </div>

            {/* Label Input */}
            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">
                Label on Receipt
              </label>
              <input
                type="text"
                value={chargeLabel}
                onChange={(e) => setChargeLabel(e.target.value)}
                placeholder="Fee or tax name"
                required
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            {/* Basis Toggle: % vs ₹ */}
            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">
                Input Type
              </label>
              <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setChargeBasis('percent');
                    if (!chargeValueStr || chargeValueStr === '50' || chargeValueStr === '100') {
                      setChargeValueStr('5');
                    }
                  }}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    chargeBasis === 'percent'
                      ? 'bg-white text-emerald-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  % Percentage
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChargeBasis('fixed');
                    if (chargeValueStr === '5' || chargeValueStr === '10') {
                      setChargeValueStr('50.00');
                    }
                  }}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    chargeBasis === 'fixed'
                      ? 'bg-white text-emerald-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  ₹ Fixed Amount
                </button>
              </div>
            </div>

            {/* Value Input */}
            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">
                {chargeBasis === 'percent' ? 'Percentage (%)' : 'Amount in Rupees (₹)'}
              </label>
              <div className="relative">
                <input
                  type="number"
                  step={chargeBasis === 'percent' ? '0.1' : '0.01'}
                  value={chargeValueStr}
                  onChange={(e) => setChargeValueStr(e.target.value)}
                  placeholder={chargeBasis === 'percent' ? '5' : '150.00'}
                  required
                  autoFocus
                  className="w-full pl-3 pr-8 py-2 rounded-xl border border-slate-200 text-sm font-mono font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-bold pointer-events-none">
                  {chargeBasis === 'percent' ? '%' : '₹'}
                </span>
              </div>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition-colors"
              >
                Add to Bill
              </button>
              <button
                type="button"
                onClick={() => setShowAddChargeModal(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
