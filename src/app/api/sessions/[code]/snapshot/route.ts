import { NextRequest, NextResponse } from 'next/server';
import { repo } from '@/lib/db/repo';
import { buildSessionSnapshot } from '@/lib/session/snapshot';

export async function GET(
  req: NextRequest,
  { params }: { params: { code: string } }
) {
  try {
    const { code } = params;
    const session = repo.getSessionByCode(code);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const snapshot = buildSessionSnapshot(session);
    return NextResponse.json(snapshot);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
