import { NextRequest, NextResponse } from 'next/server';
import { sessionService } from '@/lib/session/service';

export async function POST(
  req: NextRequest,
  { params }: { params: { code: string } }
) {
  try {
    const { code } = params;
    const body = await req.json();
    const { name } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Your name is required to join' }, { status: 400 });
    }

    const result = sessionService.joinSession(code, name);

    return NextResponse.json({
      success: true,
      participantId: result.participantId,
      token: result.token,
      snapshot: result.snapshot,
    });
  } catch (err: any) {
    console.error('Failed to join session:', err);
    return NextResponse.json({ error: err.message || 'Could not join session' }, { status: 400 });
  }
}
