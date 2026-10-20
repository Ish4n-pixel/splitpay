import { NextRequest, NextResponse } from 'next/server';
import { sessionService } from '@/lib/session/service';

export async function POST(
  req: NextRequest,
  { params }: { params: { code: string } }
) {
  try {
    const { code } = params;
    const body = await req.json();
    const { hostKey, items, charges, receiptTotalPaise } = body;

    if (!hostKey) {
      return NextResponse.json({ error: 'Missing hostKey' }, { status: 401 });
    }

    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'At least one item is required' }, { status: 400 });
    }

    const snapshot = sessionService.replaceBill(
      code,
      hostKey,
      items,
      charges || [],
      receiptTotalPaise || 0
    );

    return NextResponse.json({ success: true, snapshot });
  } catch (err: any) {
    console.error('Failed to update bill:', err);
    return NextResponse.json({ error: err.message || 'Failed to update bill' }, { status: 400 });
  }
}
