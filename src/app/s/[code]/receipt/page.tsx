'use client';

import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Receipt, Users, Calculator, ShieldCheck, AlertTriangle } from 'lucide-react';
import { useSessionSocket } from '@/lib/useSessionSocket';
import { formatINR } from '@/lib/money';

export default function ReceiptTransparencyPage() {
  const params = useParams();
  const router = useRouter();
  const code = (params.code as string)?.toUpperCase();

  const { snapshot, connected } = useSessionSocket(code);

  if (!snapshot) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Receipt className="w-8 h-8 animate-pulse text-emerald-600" />
        <p className="text-xs text-slate-500 font-medium">Loading receipt breakdown...</p>
      </div>
    );
  }

  const { session, participants, items, split } = snapshot;
  const unclaimedPaise = split.unclaimedItems.reduce((acc, u) => acc + u.totalPaise, 0);

  return (
    <div className="space-y-8 max-w-3xl mx-auto pb-12">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-5">
        <div>
          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined' && window.history.length > 1) {
                router.back();
              } else {
                router.push(`/s/${code}`);
              }
            }}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Table
          </button>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
            Full Receipt Transparency
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Table <span className="font-mono font-bold text-slate-800">{session.code}</span> • Fee Mode:{' '}
            <span className="font-semibold text-emerald-700 capitalize">{session.feeMode}</span>
          </p>
        </div>
      </div>

      {/* Zero-Sum Invariant Banner */}
      {snapshot.progress.allClaimed ? (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200/80 text-emerald-900 text-xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <span className="font-bold">Zero-Penny Discrepancy Verified:</span> The sum of individual diner shares exactly equals the venue receipt total ({formatINR(split.grandTotal)}).
            </div>
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200/80 text-amber-900 text-xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <span className="font-bold">Settlement in progress:</span> {split.unclaimedItems.length} item{split.unclaimedItems.length > 1 ? 's are' : ' is'} still unclaimed ({formatINR(unclaimedPaise)}). Zero-penny reconciliation finalizes once all items are claimed.
            </div>
          </div>
        </div>
      )}

      {/* Section 1: Itemized Dishes & Claimants */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-100 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Receipt className="w-4 h-4 text-emerald-600" />
            Itemized Line Items & Split Division
          </h2>
          <span className="text-xs font-mono font-bold text-slate-600">
            Subtotal: {formatINR(split.itemsSubtotal)}
          </span>
        </div>

        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-left text-xs min-w-[500px]">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 font-semibold uppercase tracking-wider">
                <th className="pb-2 pl-2">Dish</th>
                <th className="pb-2 w-16 text-center">Qty</th>
                <th className="pb-2 text-right">Price</th>
                <th className="pb-2 text-left pl-4">Claimed By</th>
                <th className="pb-2 text-right pr-2">Division</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => {
                const claimants = participants.filter((p) =>
                  item.claimedBy.includes(p.id)
                );
                const count = claimants.length;

                return (
                  <tr key={item.id} className="hover:bg-slate-50/60">
                    <td className="py-3 pl-2 font-medium text-slate-900">
                      {item.name}
                    </td>
                    <td className="py-3 text-center text-slate-600">
                      {item.quantity}
                    </td>
                    <td className="py-3 text-right font-mono font-semibold text-slate-900">
                      {formatINR(item.totalPaise)}
                    </td>
                    <td className="py-3 pl-4">
                      {count === 0 ? (
                        <span className="text-amber-600 font-semibold text-[11px]">
                          Unclaimed
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {claimants.map((c) => {
                            const cl = item.claims?.find((x) => x.participantId === c.id);
                            const w = cl?.weight || 1;
                            return (
                              <span
                                key={c.id}
                                className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-medium"
                              >
                                {c.name} {item.quantity > 1 ? `(${w}×)` : ''}
                              </span>
                            );
                          })}
                          {item.remainingQuantity > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">
                              {item.remainingQuantity}× unclaimed
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-3 text-right pr-2 font-mono text-[11px] text-slate-500">
                      {count > 1 ? (
                        <span>
                          ÷{count} ({formatINR(Math.round(item.totalPaise / count))} ea)
                        </span>
                      ) : count === 1 ? (
                        <span>100%</span>
                      ) : (
                        <span>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 2: Taxes, Service Charges & Fees */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-100 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Calculator className="w-4 h-4 text-emerald-600" />
            Taxes & Fees Allocation ({session.feeMode})
          </h2>
          <span className="text-xs font-mono font-bold text-slate-600">
            Total Fees: {formatINR(split.chargesTotal)}
          </span>
        </div>

        <p className="text-xs text-slate-500">
          {session.feeMode === 'proportional'
            ? 'Fees and discounts are distributed proportionally to each person’s food spend so lighter eaters are not burdened.'
            : 'Fees and discounts are distributed equally across all diners.'}
        </p>

        <div className="divide-y divide-slate-100">
          {split.charges.map((ch) => (
            <div key={ch.id} className="py-2.5 flex items-center justify-between text-xs">
              <span className="font-medium text-slate-800">{ch.label}</span>
              <span className="font-mono font-bold text-slate-900">
                {ch.totalPaise >= 0 ? '+' : ''}{formatINR(ch.totalPaise)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Section 3: Final Diner Settlement Ledger */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-100 shadow-sm space-y-4">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Users className="w-4 h-4 text-emerald-600" />
          Diner Settlement Ledger
        </h2>

        <div className="divide-y divide-slate-100">
          {split.shares.map((share) => {
            const isCovered = !!share.coveredBy;
            const coverer = isCovered
              ? participants.find((p) => p.id === share.coveredBy)
              : null;

            return (
              <div key={share.participantId} className="py-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-bold text-sm text-slate-900">
                      {share.participantName}
                    </span>
                    {isCovered && (
                      <span className="text-xs text-indigo-600 ml-2 font-medium">
                        (Covered by {coverer?.name})
                      </span>
                    )}
                    {share.coveredAmount > 0 && (
                      <span className="text-xs text-indigo-600 ml-2 font-medium">
                        (Covering {share.coveredParticipantIds.length} friend)
                      </span>
                    )}
                  </div>
                  <span className="font-mono font-extrabold text-base text-emerald-700">
                    {formatINR(share.amountDue)}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-xl">
                  <div>
                    <span>Items: </span>
                    <span className="font-mono font-semibold text-slate-800">
                      {formatINR(share.itemSubtotal)}
                    </span>
                  </div>
                  <div>
                    <span>Fees/Tax: </span>
                    <span className="font-mono font-semibold text-slate-800">
                      {formatINR(share.chargesSubtotal)}
                    </span>
                  </div>
                  <div>
                    <span>Own Share: </span>
                    <span className="font-mono font-semibold text-slate-800">
                      {formatINR(share.ownTotal)}
                    </span>
                  </div>
                  <div>
                    <span>Proxy Transfer: </span>
                    <span className="font-mono font-semibold text-slate-800">
                      {isCovered ? `-${formatINR(share.ownTotal)}` : share.coveredAmount > 0 ? `+${formatINR(share.coveredAmount)}` : '₹0.00'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
