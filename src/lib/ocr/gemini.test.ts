import { describe, it, expect } from 'vitest';
import { extractReceiptWithGemini } from './gemini';

describe('Gemini 1.5 Flash Receipt Extractor', () => {
  it('throws a descriptive error when no API key is provided or found', async () => {
    const originalKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    try {
      await expect(
        extractReceiptWithGemini('fake_base64_data', { apiKey: '' })
      ).rejects.toThrow('GEMINI_API_KEY is not configured');
    } finally {
      if (originalKey) {
        process.env.GEMINI_API_KEY = originalKey;
      }
    }
  });
});
