'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import {
  Utensils,
  Check,
  CheckCircle2,
  Clock,
  QrCode,
  ExternalLink,
  ShieldCheck,
  Receipt,
  User,
  AlertCircle,
  Loader2,
  ChevronRight,
  Lock,
} from 'lucide-react';
import { useSessionSocket } from '@/lib/useSessionSocket';
import { formatINR } from '@/lib/money';
import { buildUpiUri } from '@/lib/upi';

export default function GuestDinerPage() {
  const params = useParams();
  const code = (params.code as string)?.toUpperCase();

  const [currentParticipant, setCurrentParticipant] = useState<{
    id: string;
    token: string;
    name: string;
    isHost: boolean;
  } | null>(null);

  const [joinName, setJoinName] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [showQrModal, setShowQrModal] = useState(false);

  const { snapshot, connected, error, actions } = useSessionSocket(code);

  useEffect(() => {
    const stored = localStorage.getItem(`splitpay_participant_${code}`);
    if (stored) {
      try {
        setCurrentParticipant(JSON.parse(stored));
      } catch (e) {
        // ignore
      }
    }
  }, [code]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinName.trim()) {
      setJoinError('Please enter your name');
      return;
    }

    setIsJoining(true);
    setJoinError('');

    try {
      const res = await fetch(`/api/sessions/${code}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: joinName.trim() }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to join table');

      const participantData = {
        id: data.participantId,
        token: data.token,
        name: joinName.trim(),
        isHost: false,
      };

      localStorage.setItem(
        `splitpay_participant_${code}`,
        JSON.stringify(participantData)
      );
      setCurrentParticipant(participantData);
    } catch (err: any) {
      setJoinError(err.message || 'Could not join');
    } finally {
      setIsJoining(false);
    }
  };

  if (!snapshot) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
        <p className="text-xs text-slate-500 font-medium">Connecting to table...</p>
      </div>
    );
  }

  const { session, participants, items, split } = snapshot;

  // If visitor is not yet a registered participant, prompt for name
  if (!currentParticipant) {
    return (
      <div className="max-w-md mx-auto bg-white rounded-3xl p-6 sm:p-8 border border-slate-100 shadow-xl space-y-6 my-8">
        <div className="text-center space-y-2">
          <div className="h-12 w-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
            <Utensils className="w-6 h-6" />
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">
            Join {session.title}
          </h1>
          <p className="text-xs text-slate-500">
            Table Code: <span className="font-mono font-bold text-slate-800">{session.code}</span> • Hosted by {session.hostUpiName}
          </p>
        </div>

        <form onSubmit={handleJoin} className="space-y-4">
          {joinError && (
            <div className="p-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl">
              {joinError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              What is your name?
            </label>
            <input
              type="text"
              placeholder="Your name"
              value={joinName}
              onChange={(e) => setJoinName(e.target.value)}
              required
              autoFocus
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <button
            type="submit"
            disabled={isJoining}
            className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 text-white font-bold text-sm shadow-md shadow-emerald-500/20 hover:bg-emerald-700 transition-all disabled:opacity-50"
          >
            {isJoining ? 'Joining Table...' : 'Join Table & Claim Dishes'}
          </button>
        </form>
      </div>
    );
  }

  // Find current diner's share
  const myShare = split.shares.find(
    (s) => s.participantId === currentParticipant.id
  );
  const myParticipantRecord = participants.find(
    (p) => p.id === currentParticipant.id
  );
  const amountDue = myShare?.amountDue || 0;
  const paidAmount = myParticipantRecord?.paidAmountPaise || 0;
  const isPartiallyPaid = myParticipantRecord?.payStatus === 'partially_paid';
  const remainingDue = isPartiallyPaid ? Math.max(0, amountDue - paidAmount) : amountDue;
  const isCovered = !!myParticipantRecord?.coveredBy;
  const covererName = isCovered
    ? participants.find((p) => p.id === myParticipantRecord?.coveredBy)?.name
    : null;

  // Build UPI URI for this diner
  const upiUri = buildUpiUri({
    vpa: session.hostUpiVpa,
    name: session.hostUpiName,
    amountPaise: remainingDue,
    note: `SplitPay Table ${session.code}`,
  });

  return (
    <div className="space-y-8 max-w-2xl mx-auto pb-12">
      {/* Table & Diner Identity Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200/50">
              Table {session.code}
            </span>
            <span
              className={`h-2 w-2 rounded-full ${
                connected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'
              }`}
            />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 mt-2">
            {session.title}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Host: <span className="font-semibold text-slate-700">{session.hostUpiName}</span>
          </p>
        </div>

        {/* Action pills & Current user */}
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {currentParticipant.isHost && (
            <a
              href={`/s/${session.code}/host`}
              className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200/60 font-bold text-xs shadow-sm transition-all"
            >
              👑 Host Dashboard
            </a>
          )}

          <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-2xl">
            <div className="h-7 w-7 rounded-xl bg-emerald-600 text-white font-bold text-xs flex items-center justify-center">
              {currentParticipant.name.charAt(0).toUpperCase()}
            </div>
            <span className="text-xs font-bold text-slate-800">
              {currentParticipant.name}
            </span>
            <button
              type="button"
              onClick={() => {
                localStorage.removeItem(`splitpay_participant_${code}`);
                setCurrentParticipant(null);
              }}
              title="Switch / Change Diner"
              className="text-[10px] text-slate-400 hover:text-slate-700 underline px-1"
            >
              Switch
            </button>
            <a
              href={`/s/${session.code}/receipt`}
              className="p-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 shadow-sm transition-all"
              title="View Full Transparency Breakdown"
            >
              <Receipt className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>

      {/* Socket Error Alert */}
      {error && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Unclaimed Items Notice for Guests */}
      {split.unclaimedItems.length > 0 && (
        <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200/80 text-amber-900 text-xs flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
          <div>
            <span className="font-bold">
              {split.unclaimedItems.length} item{split.unclaimedItems.length > 1 ? 's' : ''} still unclaimed:
            </span>{' '}
            {split.unclaimedItems.map((u) => u.name).join(', ')}. Did you have any of these?
          </div>
        </div>
      )}

      {/* Your Share Settlement Summary Card (Sticky/Top) */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-3xl p-6 sm:p-8 shadow-xl shadow-slate-900/10 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              {isPartiallyPaid ? 'Remaining Due' : 'Your Share Due'}
            </span>
            <div className="text-3xl sm:text-4xl font-black font-mono mt-1 text-emerald-400">
              {isCovered ? '₹0.00' : formatINR(remainingDue)}
            </div>
          </div>

          {/* Payment Status Badge */}
          <div>
            {myParticipantRecord?.payStatus === 'paid_upi' && (
              <span className="inline-flex items-center gap-1.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-3 py-1.5 rounded-xl text-xs font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Verified & Paid ✓
              </span>
            )}
            {myParticipantRecord?.payStatus === 'paid_cash' && (
              <span className="inline-flex items-center gap-1.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-3 py-1.5 rounded-xl text-xs font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                {myParticipantRecord.isHost ? 'Host Direct (Committed to Venue) ✓' : 'Paid via Cash ✓'}
              </span>
            )}
            {myParticipantRecord?.payStatus === 'partially_paid' && (
              <span className="inline-flex items-center gap-1.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 px-3 py-1.5 rounded-xl text-xs font-bold">
                <AlertCircle className="w-4 h-4 text-amber-400" />
                Partially Paid (Paid {formatINR(paidAmount)})
              </span>
            )}
            {myParticipantRecord?.payStatus === 'pending_verify' && (
              <span className="inline-flex items-center gap-1.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 px-3 py-1.5 rounded-xl text-xs font-bold animate-pulse">
                <Clock className="w-4 h-4 text-amber-400" />
                Awaiting Host Verification
              </span>
            )}
            {myParticipantRecord?.payStatus === 'unpaid' && !isCovered && (
              <span className="bg-slate-800 text-slate-400 px-3 py-1.5 rounded-xl text-xs font-semibold">
                Unsettled
              </span>
            )}
            {isCovered && (
              <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-3 py-1.5 rounded-xl text-xs font-bold">
                Covered by {covererName}
              </span>
            )}
          </div>
        </div>

        {/* Itemized breakdown snippet */}
        {myShare && (
          <div className="border-t border-slate-700/60 pt-4 space-y-1.5 text-xs text-slate-300">
            <div className="flex justify-between">
              <span>Claimed Items Subtotal:</span>
              <span className="font-mono text-slate-100">{formatINR(myShare.itemSubtotal)}</span>
            </div>
            {myShare.charges.map((ch) => (
              <div key={ch.chargeId} className="flex justify-between text-slate-400">
                <span>{ch.label}:</span>
                <span className="font-mono">
                  {ch.paise >= 0 ? '+' : ''}{formatINR(ch.paise)}
                </span>
              </div>
            ))}
            {myShare.coveredAmount > 0 && (
              <div className="flex justify-between text-indigo-300 font-semibold pt-1 border-t border-slate-700/40">
                <span>Covering friends:</span>
                <span className="font-mono">+{formatINR(myShare.coveredAmount)}</span>
              </div>
            )}
            {paidAmount > 0 && (
              <div className="flex justify-between text-emerald-400 font-semibold pt-1 border-t border-slate-700/40">
                <span>Already Settled:</span>
                <span className="font-mono">-{formatINR(paidAmount)}</span>
              </div>
            )}
          </div>
        )}

        {/* Payment Action Buttons */}
        {remainingDue > 0 && !isCovered && myParticipantRecord?.payStatus !== 'paid_upi' && myParticipantRecord?.payStatus !== 'paid_cash' && (
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Button A: Native UPI deep link (GPay, PhonePe, Paytm on phone) */}
              <a
                href={upiUri}
                className="py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-extrabold text-xs sm:text-sm text-center shadow-lg shadow-emerald-500/20 hover:from-emerald-600 hover:to-teal-600 transition-all flex items-center justify-center gap-2"
              >
                <span>Pay {formatINR(remainingDue)} with UPI</span>
                <ExternalLink className="w-4 h-4" />
              </a>

              {/* Button B: Toggle QR code modal */}
              <button
                type="button"
                onClick={() => setShowQrModal(true)}
                className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 border border-slate-700"
              >
                <QrCode className="w-4 h-4" />
                <span>Show UPI QR Code</span>
              </button>
            </div>

            {/* "I Have Paid" manual confirmation trigger */}
            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => actions.markPaid(currentParticipant.id, currentParticipant.token)}
                className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 underline underline-offset-4 transition-colors"
              >
                Already paid? Tap here to notify host for verification
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Claim Dishes Section */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-100 shadow-sm space-y-5">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Select Dishes You Ate
          </h2>
          <p className="text-xs text-slate-500">
            Tap a dish to claim what you ate. If an item has multiple portions, you can select the exact quantity you had.
          </p>
        </div>

        <div className="space-y-3">
          {items.map((item) => {
            const myClaim = item.claims?.find((c) => c.participantId === currentParticipant.id);
            const myPortion = myClaim?.weight || 0;
            const isClaimedByMe = myPortion > 0;
            const otherClaims = (item.claims || []).filter(
              (c) => c.participantId !== currentParticipant.id && c.weight > 0
            );
            const otherClaimedQty = otherClaims.reduce((acc, c) => acc + c.weight, 0);
            const remainingForMe = Math.max(0, item.quantity - otherClaimedQty);
            const isLockedByOthers = !isClaimedByMe && remainingForMe === 0;

            const totalClaimedPortions = (item.claims || []).reduce((acc, c) => acc + c.weight, 0);
            const remainingPortions = Math.max(0, item.quantity - totalClaimedPortions);
            const unitPricePaise = item.quantity > 0 ? Math.round(item.totalPaise / item.quantity) : item.totalPaise;
            const itemShare = myShare?.items?.find((it) => it.itemId === item.id);
            const myCostPaise = itemShare?.paise || (myPortion * unitPricePaise);

            // Locked state: already fully claimed by other diners beforehand
            if (isLockedByOthers) {
              return (
                <div
                  key={item.id}
                  className="p-4 rounded-2xl border border-slate-200 bg-slate-50/80 opacity-75 flex flex-col sm:flex-row sm:items-center justify-between gap-4 select-none"
                >
                  <div className="flex items-start gap-3">
                    <div className="h-7 w-7 rounded-xl bg-slate-200/80 text-slate-500 flex items-center justify-center shrink-0 mt-0.5 border border-slate-300/60">
                      <Lock className="w-3.5 h-3.5 text-slate-500" />
                    </div>

                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-sm text-slate-700">
                          {item.quantity > 1 ? `${item.quantity}× ` : ''}
                          {item.name}
                        </span>
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-200/60 px-2 py-0.5 rounded-full font-mono">
                          {formatINR(unitPricePaise)} each
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                        <span className="inline-flex items-center gap-1 font-semibold text-slate-600 bg-slate-200/60 px-2 py-0.5 rounded-md">
                          <Lock className="w-3 h-3 text-slate-400" />
                          Claimed by {otherClaims.map((oc) => {
                            const p = participants.find((x) => x.id === oc.participantId);
                            return `${p?.name || 'Another diner'}${item.quantity > 1 ? ` (${oc.weight}×)` : ''}`;
                          }).join(', ')} • Unavailable
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200/60">
                    <span className="text-[11px] font-bold text-slate-500 bg-slate-200/80 border border-slate-300/60 px-2.5 py-1 rounded-xl">
                      Already Claimed
                    </span>
                    <span className="font-mono font-bold text-sm text-slate-400">
                      {formatINR(item.totalPaise)}
                    </span>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={item.id}
                className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                  isClaimedByMe
                    ? 'border-emerald-500 bg-emerald-50/40 shadow-sm ring-1 ring-emerald-500'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                {/* Left: Dish info & sharers */}
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      actions.setClaimPortion(
                        item.id,
                        currentParticipant.id,
                        isClaimedByMe ? 0 : 1,
                        currentParticipant.token
                      );
                    }}
                    className={`h-7 w-7 rounded-xl flex items-center justify-center transition-colors shrink-0 mt-0.5 ${
                      isClaimedByMe
                        ? 'bg-emerald-600 text-white'
                        : 'border border-slate-300 bg-white hover:border-emerald-500 text-transparent'
                    }`}
                  >
                    <Check className="w-4 h-4" />
                  </button>

                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-sm text-slate-900">
                        {item.quantity > 1 ? `${item.quantity}× ` : ''}
                        {item.name}
                      </span>
                      {item.quantity > 1 && (
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full font-mono">
                          {formatINR(unitPricePaise)} each
                        </span>
                      )}
                    </div>

                    {/* Quantity remaining indicator */}
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                      {item.quantity > 1 ? (
                        remainingPortions > 0 ? (
                          <span className="text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/50">
                            {remainingPortions} of {item.quantity} unclaimed
                          </span>
                        ) : (
                          <span className="text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/50">
                            All {item.quantity} claimed ✓
                          </span>
                        )
                      ) : null}

                      {/* Other claimants */}
                      {otherClaims.map((oc) => {
                        const claimant = participants.find((p) => p.id === oc.participantId);
                        return (
                          <span
                            key={oc.participantId}
                            className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-medium"
                          >
                            {claimant?.name}: {oc.weight}×
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Right: Quantity Stepper & Cost */}
                <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                  {/* Stepper for Multi-Quantity Items */}
                  {item.quantity > 1 ? (
                    <div className="flex items-center gap-2">
                      {isClaimedByMe ? (
                        <div className="flex items-center gap-1.5 bg-white border border-emerald-300 rounded-xl p-1 shadow-sm">
                          <button
                            type="button"
                            onClick={() =>
                              actions.setClaimPortion(
                                item.id,
                                currentParticipant.id,
                                myPortion - 1,
                                currentParticipant.token
                              )
                            }
                            className="h-7 w-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-sm flex items-center justify-center transition-colors"
                            title="Decrease portion"
                          >
                            -
                          </button>
                          <span className="font-mono font-bold text-xs px-2 text-emerald-950">
                            {myPortion} of {item.quantity}
                          </span>
                          <button
                            type="button"
                            disabled={remainingForMe <= myPortion}
                            onClick={() =>
                              actions.setClaimPortion(
                                item.id,
                                currentParticipant.id,
                                myPortion + 1,
                                currentParticipant.token
                              )
                            }
                            className="h-7 w-7 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm flex items-center justify-center transition-colors disabled:opacity-40"
                            title="Increase portion"
                          >
                            +
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            actions.setClaimPortion(
                              item.id,
                              currentParticipant.id,
                              1,
                              currentParticipant.token
                            )
                          }
                          className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 text-slate-700 font-bold text-xs transition-colors border border-slate-200/80"
                        >
                          + Claim 1 Portion
                        </button>
                      )}
                    </div>
                  ) : null}

                  {/* Price Breakdown */}
                  <div className="text-right">
                    <span className="font-mono font-bold text-sm text-slate-900 block">
                      {formatINR(item.totalPaise)}
                    </span>
                    {isClaimedByMe && (
                      <span className="text-[11px] text-emerald-700 font-mono font-extrabold block">
                        Your share: {formatINR(myCostPaise)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Dynamic QR Code Modal */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-sm w-full text-center space-y-4 shadow-2xl">
            <h3 className="font-extrabold text-slate-900 text-lg">
              Scan & Pay Your Share
            </h3>
            <p className="text-xs text-slate-500">
              Paying <span className="font-semibold text-slate-800">{session.hostUpiName}</span> ({session.hostUpiVpa})
            </p>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex justify-center">
              <img
                src={`/api/qr?text=${encodeURIComponent(upiUri)}`}
                alt="UPI Payment QR Code"
                className="w-56 h-56 rounded-xl object-contain"
              />
            </div>

            <div className="font-mono text-2xl font-black text-emerald-600">
              {formatINR(remainingDue)}
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  actions.markPaid(currentParticipant.id, currentParticipant.token);
                  setShowQrModal(false);
                }}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 font-bold text-xs text-white transition-colors"
              >
                I&apos;ve Paid this Amount
              </button>

              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-xs text-slate-800 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
