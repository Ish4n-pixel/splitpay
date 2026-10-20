import { NextRequest, NextResponse } from 'next/server';
import { sessionService } from '@/lib/session/service';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, hostName, hostUpiVpa, hostUpiName, feeMode } = body;

    if (!hostName || !hostName.trim()) {
      return NextResponse.json({ error: 'Host name is required' }, { status: 400 });
    }

    if (!hostUpiVpa || !hostUpiVpa.includes('@')) {
      return NextResponse.json({ error: 'Valid UPI ID (VPA) is required (name@bank)' }, { status: 400 });
    }

    const result = sessionService.createSession({
      title: title || `${hostName.trim()}'s Table`,
      hostName,
      hostUpiVpa,
      hostUpiName: hostUpiName || hostName,
      feeMode: feeMode === 'equal' ? 'equal' : 'proportional',
    });

    return NextResponse.json({
      success: true,
      code: result.session.code,
      hostKey: result.hostKey,
      hostParticipantToken: result.hostParticipantToken,
      hostParticipantId: result.hostParticipantId,
      sessionId: result.session.id,
    });
  } catch (err: any) {
    console.error('Failed to create session:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
