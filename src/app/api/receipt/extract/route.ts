import { NextRequest, NextResponse } from 'next/server';
import { extractReceiptWithGemini, getDefaultGeminiKey } from '@/lib/ocr/gemini';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    hasServerKey: Boolean(getDefaultGeminiKey()),
  });
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';
    let imageBase64 = '';
    let mimeType = 'image/jpeg';
    let userApiKey: string | undefined = undefined;

    if (contentType.includes('application/json')) {
      const body = await req.json();
      imageBase64 = body.imageBase64 || '';
      mimeType = body.mimeType || 'image/jpeg';
      userApiKey = body.apiKey;
    } else if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      userApiKey = (formData.get('apiKey') as string) || undefined;

      if (!file) {
        return NextResponse.json({ error: 'No image file uploaded' }, { status: 400 });
      }

      mimeType = file.type || 'image/jpeg';
      const arrayBuffer = await file.arrayBuffer();
      imageBase64 = Buffer.from(arrayBuffer).toString('base64');
    } else {
      return NextResponse.json({ error: 'Unsupported Content-Type' }, { status: 400 });
    }

    if (!imageBase64) {
      return NextResponse.json({ error: 'Missing image payload' }, { status: 400 });
    }

    const apiKey = userApiKey || getDefaultGeminiKey();
    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          error: 'GEMINI_API_KEY_MISSING',
          message: 'Gemini API key is not set. You can provide an API key or use local OCR.',
        },
        { status: 400 }
      );
    }

    const parsed = await extractReceiptWithGemini(imageBase64, { apiKey, mimeType });

    return NextResponse.json({
      success: true,
      method: 'gemini',
      data: parsed,
    });
  } catch (err: any) {
    console.error('Gemini Receipt Extraction API Error:', err);
    return NextResponse.json(
      {
        success: false,
        error: 'EXTRACTION_FAILED',
        message: err.message || 'Failed to extract receipt items with Gemini AI.',
      },
      { status: 500 }
    );
  }
}
