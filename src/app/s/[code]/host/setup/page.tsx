'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Camera,
  Upload,
  Sparkles,
  Plus,
  Trash2,
  CheckCircle,
  AlertTriangle,
  ArrowRight,
  Loader2,
  Receipt,
  RotateCcw,
  Key,
  FileText,
} from 'lucide-react';
import { parseReceipt, ParsedItem, ParsedCharge } from '@/lib/ocr/parseReceipt';
import { recognizeReceipt, OcrProgress } from '@/lib/ocr/recognize';
import { preprocessReceiptImage } from '@/lib/ocr/preprocess';
import { formatINR, toPaise, toRupees } from '@/lib/money';
import { ChargeKind, ChargeBasis } from '@/lib/split/engine';

export default function HostBillSetupPage() {
  const params = useParams();
  const router = useRouter();
  const code = (params.code as string)?.toUpperCase();

  const [hostKey, setHostKey] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'ocr' | 'manual'>('ocr');

  // OCR state
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrProgress, setOcrProgress] = useState<OcrProgress | null>(null);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [geminiApiKey, setGeminiApiKey] = useState<string>('');
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [hasServerKey, setHasServerKey] = useState<boolean | null>(null);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteText, setPasteText] = useState('');

  // Review table items
  const [items, setItems] = useState<ParsedItem[]>([]);
  const [charges, setCharges] = useState<ParsedCharge[]>([]);
  const [printedTotalRupees, setPrintedTotalRupees] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hostKeyInput, setHostKeyInput] = useState<string>('');

  useEffect(() => {
    const key = localStorage.getItem(`splitpay_host_key_${code}`);
    if (key) {
      setHostKey(key);
      setHostKeyInput(key);
    }

    const savedGeminiKey = localStorage.getItem('splitpay_gemini_key');
    if (savedGeminiKey) {
      setGeminiApiKey(savedGeminiKey);
    }

    // Check if server has Gemini API Key configured
    fetch('/api/receipt/extract')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && typeof data.hasServerKey === 'boolean') {
          setHasServerKey(data.hasServerKey);
        }
      })
      .catch(() => setHasServerKey(false));

    // Preload existing items if editing an existing bill
    if (code) {
      fetch(`/api/sessions/${code}/snapshot`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && data.items && data.items.length > 0) {
            setItems((prev) => {
              if (prev.length > 0) return prev; // don't overwrite if user already typed
              return data.items.map((i: any) => ({
                id: i.id,
                name: i.name,
                quantity: i.quantity,
                unitPricePaise: i.unitPricePaise,
                totalPaise: i.totalPaise,
                rawPrice: (i.unitPricePaise / 100).toFixed(2),
              }));
            });

            if (data.charges && data.charges.length > 0) {
              setCharges((prev) => {
                if (prev.length > 0) return prev;
                return data.charges.map((c: any) => ({
                  id: c.id,
                  kind: c.kind,
                  label: c.label,
                  basis: c.basis,
                  value: c.value,
                  amountPaise: c.totalPaise,
                  rawValue: c.basis === 'percent' ? String(c.value) : (c.value / 100).toFixed(2),
                }));
              });
            }

            if (data.session && data.session.receiptTotalPaise > 0) {
              setPrintedTotalRupees((prev) =>
                prev ? prev : (data.session.receiptTotalPaise / 100).toFixed(2)
              );
            }
          }
        })
        .catch(() => {});
    }
  }, [code]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setOcrLoading(true);
    setOcrError(null);
    setOcrProgress({ status: 'Optimizing receipt photo (downscaling & contrast boost)...', progress: 0.15 });

    try {
      // 1. Preprocess and downscale image on client canvas (shrinks 10MB phone camera photos to ~300KB)
      const preprocessed = await preprocessReceiptImage(file);

      // 2. Attempt smart extraction via Gemini 1.5 Flash API
      setOcrProgress({ status: '✨ Extracting dishes, quantities & GST with Gemini 1.5 Flash...', progress: 0.45 });

      const res = await fetch('/api/receipt/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: preprocessed.base64,
          mimeType: 'image/jpeg',
          apiKey: geminiApiKey || undefined,
        }),
      });

      const resData = await res.json();

      if (res.ok && resData.success && resData.data?.items?.length > 0) {
        const parsed = resData.data;
        setItems(
          parsed.items.map((i: any) => ({
            ...i,
            rawPrice: (i.unitPricePaise / 100).toFixed(2),
          }))
        );
        setCharges(
          parsed.charges.map((c: any) => ({
            ...c,
            rawValue: c.basis === 'percent' ? String(c.value) : (c.value / 100).toFixed(2),
          }))
        );
        if (parsed.printedTotalPaise > 0) {
          setPrintedTotalRupees((parsed.printedTotalPaise / 100).toFixed(2));
        }
        setOcrProgress({ status: '✨ Successfully extracted with Gemini AI!', progress: 1.0 });
        return;
      }

      // If server returned GEMINI_API_KEY_MISSING, open the key dialog
      if (resData?.error === 'GEMINI_API_KEY_MISSING') {
        setShowKeyModal(true);
        setOcrError('A Google Gemini API key is required for AI receipt scanning. Paste your free key below or enter dishes manually.');
        return;
      }

      // 3. Fallback to client-side local OCR
      console.warn('Gemini extraction unavailable, falling back to local OCR:', resData?.message || resData?.error);
      setOcrProgress({ status: 'Scanning receipt lines with local OCR...', progress: 0.65 });

      const text = await recognizeReceipt(preprocessed.blob, (p) => setOcrProgress(p));
      const parsed = parseReceipt(text);

      if (parsed.items.length === 0) {
        setOcrError(
          resData?.message || 'No dishes could be clearly identified. You can paste receipt text or add items manually below.'
        );
      } else {
        setItems(
          parsed.items.map((i) => ({
            ...i,
            rawPrice: (i.unitPricePaise / 100).toFixed(2),
          }))
        );
        setCharges(
          parsed.charges.map((c) => ({
            ...c,
            rawValue: c.basis === 'percent' ? String(c.value) : (c.value / 100).toFixed(2),
          }))
        );
        if (parsed.printedTotalPaise > 0) {
          setPrintedTotalRupees((parsed.printedTotalPaise / 100).toFixed(2));
        }
      }
    } catch (err: any) {
      console.error('OCR Error:', err);
      setOcrError(err.message || 'Failed to read receipt image');
    } finally {
      setOcrLoading(false);
      setTimeout(() => setOcrProgress(null), 1200);
    }
  };

  const handlePasteExtract = () => {
    if (!pasteText.trim()) return;
    const parsed = parseReceipt(pasteText);
    if (parsed.items.length === 0) {
      setOcrError('No dishes could be recognized in the pasted text. Please verify the lines or enter items manually below.');
      return;
    }
    setItems(
      parsed.items.map((i) => ({
        ...i,
        rawPrice: (i.unitPricePaise / 100).toFixed(2),
      }))
    );
    setCharges(
      parsed.charges.map((c) => ({
        ...c,
        rawValue: c.basis === 'percent' ? String(c.value) : (c.value / 100).toFixed(2),
      }))
    );
    if (parsed.printedTotalPaise > 0) {
      setPrintedTotalRupees((parsed.printedTotalPaise / 100).toFixed(2));
    }
    setShowPasteModal(false);
    setPasteText('');
    setOcrError(null);
  };

  // Item modification helpers
  const updateItem = (index: number, field: keyof ParsedItem, val: any) => {
    setItems((prev) => {
      const copy = [...prev];
      const target = { ...copy[index] };

      if (field === 'name') {
        target.name = val;
      } else if (field === 'quantity') {
        const q = Math.max(1, parseInt(val, 10) || 1);
        target.quantity = q;
        target.totalPaise = target.unitPricePaise * q;
      } else if (field === 'unitPricePaise') {
        target.rawPrice = val;
        const p = toPaise(val);
        target.unitPricePaise = p;
        target.totalPaise = p * target.quantity;
      }

      copy[index] = target;
      return copy;
    });
  };

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      {
        id: `manual_${Date.now()}`,
        name: 'New Dish',
        quantity: 1,
        unitPricePaise: 20000,
        totalPaise: 20000,
        rawPrice: '200.00',
      },
    ]);
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Charge modification helpers
  const addCharge = (kind: ChargeKind, defaultBasis: ChargeBasis = 'percent') => {
    const isPercent = defaultBasis === 'percent';
    setCharges((prev) => [
      ...prev,
      {
        id: `charge_${Date.now()}`,
        kind,
        label:
          kind === 'tax'
            ? isPercent
              ? 'GST 5%'
              : 'GST (Fixed)'
            : kind === 'service'
            ? isPercent
              ? 'Service Charge 10%'
              : 'Service Charge (Fixed)'
            : kind === 'discount'
            ? 'Discount'
            : 'Tip',
        basis: defaultBasis,
        value: isPercent ? (kind === 'tax' ? 5 : 10) : kind === 'tax' ? 5000 : 10000,
        amountPaise: isPercent ? 5000 : 5000,
        rawValue: isPercent ? (kind === 'tax' ? '5' : '10') : kind === 'tax' ? '50.00' : '100.00',
      },
    ]);
  };

  const updateCharge = (index: number, updates: Partial<ParsedCharge>) => {
    setCharges((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], ...updates };
      return copy;
    });
  };

  const removeCharge = (index: number) => {
    setCharges((prev) => prev.filter((_, i) => i !== index));
  };

  // Financial calculations & Cross-check
  const itemsSubtotalPaise = items.reduce((acc, i) => acc + i.totalPaise, 0);

  const calculatedChargesTotalPaise = charges.reduce((acc, ch) => {
    let amt = 0;
    if (ch.basis === 'percent') {
      amt = Math.round((itemsSubtotalPaise * ch.value) / 100);
    } else {
      amt = Math.round(ch.value);
    }
    return acc + (ch.kind === 'discount' ? -Math.abs(amt) : amt);
  }, 0);

  const calculatedGrandTotalPaise = itemsSubtotalPaise + calculatedChargesTotalPaise;
  const printedTotalPaise = toPaise(printedTotalRupees);
  const diffPaise = printedTotalPaise > 0 ? calculatedGrandTotalPaise - printedTotalPaise : 0;
  const isBalanced = printedTotalPaise > 0 && Math.abs(diffPaise) === 0;

  // Save bill and continue to Table Dashboard
  const handleSaveBill = async () => {
    if (items.length === 0) {
      setSaveError('Please add at least one line item to the bill.');
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      const res = await fetch(`/api/sessions/${code}/bill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostKey,
          items: items.map((i) => ({
            id: i.id,
            name: i.name.trim(),
            quantity: i.quantity,
            unitPricePaise: i.unitPricePaise,
            totalPaise: i.totalPaise,
          })),
          charges: charges.map((ch) => ({
            id: ch.id,
            kind: ch.kind,
            label: ch.label.trim(),
            basis: ch.basis,
            value: ch.value,
          })),
          receiptTotalPaise: printedTotalPaise > 0 ? printedTotalPaise : calculatedGrandTotalPaise,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save bill');

      // Bill saved! Navigate to the live host dashboard
      router.push(`/s/${code}/host`);
    } catch (err: any) {
      setSaveError(err.message || 'Error saving bill');
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Step Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200/50">
            Step 1: Ingest Receipt
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-2">
            Add Table Bill
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Table Code: <span className="font-mono font-bold text-slate-800">{code}</span>
          </p>
        </div>
      </div>

      {/* Input Options (OCR vs Paste vs Manual) */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-100 shadow-sm space-y-6">
        {/* Gemini Key Missing Notice Banner */}
        {hasServerKey === false && !geminiApiKey && (
          <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
            <div className="flex items-start gap-2.5">
              <Sparkles className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-xs text-amber-900 block">
                  Enable High-Accuracy AI Receipt Scanning
                </span>
                <span className="text-[11px] text-amber-700">
                  Paper bills have shadows and faded ink. Enter a free Gemini API key to scan receipts with 99% accuracy.
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowKeyModal(true)}
              className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-sm transition-colors whitespace-nowrap self-start sm:self-auto"
            >
              + Add Free Gemini Key
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Option A: Camera / Upload */}
          <label className="relative flex flex-col items-center justify-center p-5 border-2 border-dashed border-emerald-300 bg-emerald-50/40 rounded-2xl cursor-pointer hover:bg-emerald-50/70 transition-colors group text-center">
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileUpload}
              disabled={ocrLoading}
              className="sr-only"
            />
            <div className="h-11 w-11 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-md shadow-emerald-500/20 group-hover:scale-105 transition-transform mb-2.5">
              <Camera className="w-5 h-5" />
            </div>
            <div className="flex items-center gap-1.5 justify-center">
              <span className="font-bold text-xs sm:text-sm text-slate-900">
                Snap or Upload
              </span>
              <span className="text-[9px] font-extrabold uppercase px-1 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
                AI Vision
              </span>
            </div>
            <span className="text-[11px] text-slate-500 mt-1">
              Extracts dishes, quantities & GST with Gemini AI
            </span>
          </label>

          {/* Option B: Paste Receipt Text */}
          <div
            onClick={() => setShowPasteModal(true)}
            className="flex flex-col items-center justify-center p-5 border-2 border-dashed border-slate-200 bg-slate-50/50 rounded-2xl cursor-pointer hover:bg-slate-100/60 transition-colors text-center group"
          >
            <div className="h-11 w-11 rounded-2xl bg-slate-200 text-slate-700 flex items-center justify-center mb-2.5 group-hover:scale-105 transition-transform">
              <FileText className="w-5 h-5" />
            </div>
            <span className="font-bold text-xs sm:text-sm text-slate-900">
              Paste Bill Text
            </span>
            <span className="text-[11px] text-slate-500 mt-1">
              Paste from SMS, WhatsApp, Swiggy, or e-bill
            </span>
          </div>

          {/* Option C: Manual Entry */}
          <div
            onClick={() => {
              if (items.length === 0) addItem();
            }}
            className="flex flex-col items-center justify-center p-5 border-2 border-dashed border-slate-200 bg-slate-50/50 rounded-2xl cursor-pointer hover:bg-slate-100/60 transition-colors text-center group"
          >
            <div className="h-11 w-11 rounded-2xl bg-slate-200 text-slate-700 flex items-center justify-center mb-2.5 group-hover:scale-105 transition-transform">
              <Receipt className="w-5 h-5" />
            </div>
            <span className="font-bold text-xs sm:text-sm text-slate-900">
              Manual Entry
            </span>
            <span className="text-[11px] text-slate-500 mt-1">
              Add individual dishes and prices row by row below
            </span>
          </div>
        </div>

        {/* AI Info Bar & Key Settings */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-500 gap-2 px-1">
          <span className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            <span>AI Receipt Engine: <strong>Gemini 1.5 Flash</strong> {hasServerKey || geminiApiKey ? '✓ Active' : '(Fallback Active)'}</span>
          </span>
          <button
            type="button"
            onClick={() => setShowKeyModal(true)}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-emerald-700 underline underline-offset-2 transition-colors self-start sm:self-auto"
          >
            <Key className="w-3 h-3 text-slate-400" />
            {geminiApiKey ? 'Custom Gemini Key Set ✓' : 'Custom Gemini API Key (Optional)'}
          </button>
        </div>

        {/* OCR Progress / Status */}
        {ocrLoading && (
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs font-semibold text-emerald-800">
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                {ocrProgress?.status || 'Processing receipt image...'}
              </span>
              <span>{Math.round((ocrProgress?.progress || 0) * 100)}%</span>
            </div>
            <div className="w-full h-2 bg-emerald-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-600 transition-all duration-300"
                style={{ width: `${Math.max(10, Math.round((ocrProgress?.progress || 0) * 100))}%` }}
              />
            </div>
          </div>
        )}

        {ocrError && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{ocrError}</span>
          </div>
        )}
      </div>

      {/* Editable Line Items Section */}
      <div id="items-section" className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-100 shadow-sm space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Receipt Items ({items.length})
            </h2>
            <p className="text-xs text-slate-500">
              Review and adjust dishes or prices before opening the table to guests.
            </p>
          </div>
          <button
            type="button"
            onClick={addItem}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Dish
          </button>
        </div>

        {items.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-xs border border-dashed border-slate-200 rounded-2xl">
            No dishes added yet. Upload a receipt photo or click &ldquo;Load Sample Indian Receipt&rdquo;.
          </div>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-left text-xs min-w-[500px]">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="pb-2 pl-2">Dish / Item Name</th>
                  <th className="pb-2 w-20 text-center">Qty</th>
                  <th className="pb-2 w-28 text-right">Unit Price (₹)</th>
                  <th className="pb-2 w-28 text-right">Total (₹)</th>
                  <th className="pb-2 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item, idx) => (
                  <tr key={item.id} className="group hover:bg-slate-50/60">
                    <td className="py-2.5 pl-2">
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) => updateItem(idx, 'name', e.target.value)}
                        className="w-full px-2 py-1 rounded-lg border border-transparent hover:border-slate-200 focus:border-emerald-500 font-medium text-slate-900 text-xs focus:outline-none"
                      />
                    </td>
                    <td className="py-2.5 text-center">
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                        className="w-14 text-center px-1 py-1 rounded-lg border border-transparent hover:border-slate-200 focus:border-emerald-500 font-medium text-slate-800 text-xs focus:outline-none"
                      />
                    </td>
                    <td className="py-2.5 text-right">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={item.rawPrice !== undefined ? item.rawPrice : (item.unitPricePaise / 100).toFixed(2)}
                        onChange={(e) => updateItem(idx, 'unitPricePaise', e.target.value)}
                        className="w-24 text-right px-2 py-1 rounded-lg border border-transparent hover:border-slate-200 focus:border-emerald-500 font-mono text-slate-800 text-xs focus:outline-none"
                      />
                    </td>
                    <td className="py-2.5 text-right font-mono font-bold text-slate-900 pr-2">
                      {formatINR(item.totalPaise)}
                    </td>
                    <td className="py-2.5 text-right pr-2">
                      <button
                        type="button"
                        onClick={() => removeItem(idx)}
                        className="p-1 rounded-lg text-slate-300 hover:text-rose-500 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Taxes, Service Charges & Discounts */}
        <div className="border-t border-slate-100 pt-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Taxes, Service Charges & Discounts
            </h3>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => addCharge('tax', 'percent')}
                className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[11px] font-semibold border border-emerald-200/50 transition-colors"
              >
                + GST (5%)
              </button>
              <button
                type="button"
                onClick={() => addCharge('tax', 'fixed')}
                className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[11px] font-semibold border border-emerald-200/50 transition-colors"
              >
                + GST (Fixed ₹)
              </button>
              <button
                type="button"
                onClick={() => addCharge('service', 'percent')}
                className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-800 text-[11px] font-semibold border border-blue-200/50 transition-colors"
              >
                + Svc Chg (10%)
              </button>
              <button
                type="button"
                onClick={() => addCharge('service', 'fixed')}
                className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-800 text-[11px] font-semibold border border-blue-200/50 transition-colors"
              >
                + Svc Chg (Fixed ₹)
              </button>
              <button
                type="button"
                onClick={() => addCharge('discount', 'fixed')}
                className="px-2.5 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-800 text-[11px] font-semibold border border-purple-200/50 transition-colors"
              >
                + Discount
              </button>
            </div>
          </div>

          {charges.map((ch, idx) => {
            const calculatedPaise =
              ch.basis === 'percent'
                ? Math.round((itemsSubtotalPaise * (ch.value || 0)) / 100)
                : ch.value;

            return (
              <div
                key={ch.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-2xl bg-slate-50/80 border border-slate-200/80 text-xs"
              >
                <input
                  type="text"
                  value={ch.label}
                  onChange={(e) => updateCharge(idx, { label: e.target.value })}
                  placeholder="e.g. GST, Service Charge, Discount"
                  className="flex-1 px-3 py-1.5 rounded-xl bg-white border border-slate-200 font-semibold text-slate-800 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />

                <div className="flex items-center gap-2">
                  {/* Mode Selector Toggle: % Percent vs ₹ Fixed */}
                  <div className="flex rounded-lg bg-slate-200/70 p-0.5 border border-slate-200">
                    <button
                      type="button"
                      onClick={() => {
                        updateCharge(idx, {
                          basis: 'percent',
                          value: ch.basis === 'percent' ? ch.value : 5,
                          rawValue: ch.basis === 'percent' ? String(ch.value) : '5',
                        });
                      }}
                      className={`px-2 py-1 rounded-md text-[11px] font-bold transition-all ${
                        ch.basis === 'percent'
                          ? 'bg-white text-emerald-700 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      %
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const amt = ch.basis === 'percent' ? calculatedPaise : ch.value;
                        updateCharge(idx, {
                          basis: 'fixed',
                          value: amt > 0 ? amt : 5000,
                          rawValue: amt > 0 ? (amt / 100).toFixed(2) : '50.00',
                        });
                      }}
                      className={`px-2 py-1 rounded-md text-[11px] font-bold transition-all ${
                        ch.basis === 'fixed'
                          ? 'bg-white text-emerald-700 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      ₹
                    </button>
                  </div>

                  {/* Value Input */}
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={
                        ch.rawValue !== undefined
                          ? ch.rawValue
                          : ch.basis === 'percent'
                          ? String(ch.value)
                          : (ch.value / 100).toFixed(2)
                      }
                      onChange={(e) => {
                        const raw = e.target.value;
                        const v = parseFloat(raw) || 0;
                        updateCharge(idx, {
                          value: ch.basis === 'percent' ? v : toPaise(raw),
                          rawValue: raw,
                        });
                      }}
                      className="w-24 text-right pr-6 pl-2 py-1.5 rounded-xl bg-white border border-slate-200 font-mono text-xs font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                    <span className="absolute right-2 top-2 text-[10px] text-slate-400 font-bold pointer-events-none">
                      {ch.basis === 'percent' ? '%' : '₹'}
                    </span>
                  </div>

                  {/* Live rupee calculated equivalent */}
                  {ch.basis === 'percent' && (
                    <span className="text-[11px] font-mono text-slate-500 font-medium whitespace-nowrap">
                      (= {formatINR(calculatedPaise)})
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => removeCharge(idx)}
                    title="Remove charge"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Live Cross Check Math Verification Box */}
        <div className="border-t border-slate-200 pt-5 space-y-4">
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>Items Subtotal:</span>
              <span className="font-mono font-bold text-slate-900">{formatINR(itemsSubtotalPaise)}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>Taxes, Fees & Discounts:</span>
              <span className="font-mono font-bold text-slate-900">
                {calculatedChargesTotalPaise >= 0 ? '+' : ''}{formatINR(calculatedChargesTotalPaise)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm font-bold text-slate-900 border-t border-slate-200 pt-2">
              <span>Calculated Total:</span>
              <span className="font-mono text-emerald-700">{formatINR(calculatedGrandTotalPaise)}</span>
            </div>

            {/* Printed receipt cross-check */}
            <div className="flex items-center justify-between gap-4 pt-2 border-t border-slate-200">
              <label className="text-xs font-semibold text-slate-700">
                Printed Receipt Grand Total (₹):
              </label>
              <input
                type="number"
                step="0.01"
                placeholder={toRupees(calculatedGrandTotalPaise).toFixed(2)}
                value={printedTotalRupees}
                onChange={(e) => setPrintedTotalRupees(e.target.value)}
                className="w-36 text-right px-3 py-1.5 rounded-xl border border-slate-300 font-mono text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Validation Banner */}
          {printedTotalPaise > 0 && (
            <div>
              {isBalanced ? (
                <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    Math balances perfectly! Calculated sum matches printed receipt ({formatINR(calculatedGrandTotalPaise)}).
                  </span>
                </div>
              ) : (
                <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    Variance detected: Calculated {formatINR(calculatedGrandTotalPaise)} vs Printed {formatINR(printedTotalPaise)} (Difference: {formatINR(Math.abs(diffPaise))}).
                  </span>
                </div>
              )}
            </div>
          )}

          {!hostKey && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="font-medium">Host key needed to save bill updates:</span>
              <input
                type="text"
                placeholder="Paste Host Key"
                value={hostKeyInput}
                onChange={(e) => {
                  const k = e.target.value.trim();
                  setHostKeyInput(k);
                  setHostKey(k);
                  if (k) localStorage.setItem(`splitpay_host_key_${code}`, k);
                }}
                className="px-3 py-1.5 rounded-lg border border-amber-300 font-mono text-xs bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>
          )}

          {saveError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
              {saveError}
            </div>
          )}

          {/* Save & Proceed Button */}
          <button
            type="button"
            onClick={handleSaveBill}
            disabled={isSaving || items.length === 0}
            className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-extrabold text-sm shadow-md shadow-emerald-500/20 hover:from-emerald-700 hover:to-teal-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                Save Bill & Open Table for Diners
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Gemini API Key Modal */}
      {showKeyModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-slate-100 space-y-4">
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Key className="w-4 h-4 text-emerald-600" />
                Gemini 1.5 Flash API Key
              </h3>
              <p className="text-xs text-slate-500">
                SplitPay uses Google Gemini 1.5 Flash for high-accuracy receipt extraction. You can paste your free Google AI Studio key below or leave it blank to use the server default.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-700 block">
                Google AI Studio API Key:
              </label>
              <input
                type="password"
                placeholder="AIzaSy..."
                value={geminiApiKey}
                onChange={(e) => setGeminiApiKey(e.target.value.trim())}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <p className="text-[11px] text-slate-400">
                Stored safely in your device browser's localStorage.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setGeminiApiKey('');
                  localStorage.removeItem('splitpay_gemini_key');
                  setShowKeyModal(false);
                }}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Clear / Use Server Key
              </button>
              <button
                type="button"
                onClick={() => {
                  if (geminiApiKey) {
                    localStorage.setItem('splitpay_gemini_key', geminiApiKey);
                  } else {
                    localStorage.removeItem('splitpay_gemini_key');
                  }
                  setShowKeyModal(false);
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors"
              >
                Save Key
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Paste Receipt Text Modal */}
      {showPasteModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl border border-slate-100 space-y-4">
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-600" />
                Paste Receipt Text
              </h3>
              <p className="text-xs text-slate-500">
                Paste receipt lines from WhatsApp, SMS, Swiggy, Zomato, or an electronic invoice. SplitPay will extract only the dishes, quantities, and prices.
              </p>
            </div>

            <textarea
              rows={8}
              placeholder={`Paste receipt text here, e.g.:
1 Paneer Tikka 240.00
2 Garlic Naan 180.00
Dal Makhani 350.00
GST 5% 38.50
Grand Total 808.50`}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              className="w-full p-3.5 rounded-xl border border-slate-200 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50/50"
            />

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowPasteModal(false);
                  setPasteText('');
                }}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePasteExtract}
                disabled={!pasteText.trim()}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors disabled:opacity-50"
              >
                Extract Dishes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
