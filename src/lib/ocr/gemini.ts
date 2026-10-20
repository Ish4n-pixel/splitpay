import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { nanoid } from 'nanoid';
import { ParsedReceipt, ParsedItem, ParsedCharge } from './parseReceipt';

export interface GeminiExtractionOptions {
  apiKey?: string;
  mimeType?: string;
}

/**
 * Extracts structured dishes, quantities, prices, taxes, and totals from a receipt image
 * using Google Gemini 1.5 Flash multimodal vision with typed JSON schema enforcement.
 */
export async function extractReceiptWithGemini(
  imageBase64: string,
  options: GeminiExtractionOptions = {}
): Promise<ParsedReceipt> {
  const apiKey = options.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server or provided by host.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          items: {
            type: SchemaType.ARRAY,
            description: 'List of dishes, food items, and drinks ordered.',
            items: {
              type: SchemaType.OBJECT,
              properties: {
                name: {
                  type: SchemaType.STRING,
                  description: 'Clean dish name without extraneous receipt artifacts or codes.',
                },
                quantity: {
                  type: SchemaType.INTEGER,
                  description: 'Quantity of this item ordered (integer >= 1).',
                },
                unitPriceRupees: {
                  type: SchemaType.NUMBER,
                  description: 'Price per individual unit in standard currency units (Rupees).',
                },
                totalRupees: {
                  type: SchemaType.NUMBER,
                  description: 'Total price for this line item in standard currency units (Rupees).',
                },
              },
              required: ['name', 'quantity', 'totalRupees'],
            },
          },
          taxes: {
            type: SchemaType.ARRAY,
            description: 'Taxes listed on the receipt (e.g. GST, CGST, SGST, VAT).',
            items: {
              type: SchemaType.OBJECT,
              properties: {
                label: {
                  type: SchemaType.STRING,
                  description: 'Tax name, e.g. "GST 5%" or "CGST 2.5%".',
                },
                amountRupees: {
                  type: SchemaType.NUMBER,
                  description: 'Calculated tax amount in Rupees.',
                },
                percent: {
                  type: SchemaType.NUMBER,
                  description: 'Percentage rate if explicitly stated (e.g. 2.5 or 5).',
                },
              },
              required: ['label', 'amountRupees'],
            },
          },
          serviceChargeRupees: {
            type: SchemaType.NUMBER,
            description: 'Service fee or service charge in Rupees, 0 if none.',
          },
          discountRupees: {
            type: SchemaType.NUMBER,
            description: 'Total discount deducted in Rupees, 0 if none.',
          },
          tipRupees: {
            type: SchemaType.NUMBER,
            description: 'Tip added to the bill in Rupees, 0 if none.',
          },
          grandTotalRupees: {
            type: SchemaType.NUMBER,
            description: 'Final payable grand total on the receipt in Rupees.',
          },
        },
        required: ['items', 'grandTotalRupees'],
      },
    },
  });

  const prompt = `You are an expert restaurant bill parser for SplitPay.
Carefully inspect this restaurant receipt or invoice image.
1. Extract all food dishes, beverages, and items ordered with their exact quantity and prices.
2. If an item says "2 Chicken Tikka 400.00", quantity is 2, unitPriceRupees is 200, totalRupees is 400.
3. If smudged, verify that (quantity * unitPriceRupees == totalRupees).
4. Extract all applicable taxes (GST, CGST, SGST, VAT), service charges, discounts, and tips.
5. Extract the final printed grand total.
6. Strictly ignore non-food header/footer lines such as table numbers, order numbers, GSTIN, dates, phone numbers, addresses, or cashier names.`;

  const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');

  const result = await model.generateContent([
    prompt,
    {
      inlineData: {
        data: cleanBase64,
        mimeType: options.mimeType || 'image/jpeg',
      },
    },
  ]);

  const rawJson = result.response.text();
  const parsedData = JSON.parse(rawJson);

  const items: ParsedItem[] = (parsedData.items || []).map((it: any) => {
    const qty = Math.max(1, Math.round(it.quantity || 1));
    const totalPaise = Math.round((Number(it.totalRupees) || 0) * 100);
    const unitPricePaise = it.unitPriceRupees
      ? Math.round(Number(it.unitPriceRupees) * 100)
      : Math.round(totalPaise / qty);

    return {
      id: nanoid(8),
      name: String(it.name || 'Dish').trim(),
      quantity: qty,
      totalPaise,
      unitPricePaise,
      rawPrice: (unitPricePaise / 100).toFixed(2),
    };
  });

  const charges: ParsedCharge[] = [];

  // Add Taxes
  if (Array.isArray(parsedData.taxes)) {
    for (const tax of parsedData.taxes) {
      const amtPaise = Math.round((Number(tax.amountRupees) || 0) * 100);
      if (amtPaise > 0) {
        const hasPercent = typeof tax.percent === 'number' && tax.percent > 0;
        charges.push({
          id: nanoid(8),
          kind: 'tax',
          label: String(tax.label || 'GST').trim(),
          basis: hasPercent ? 'percent' : 'fixed',
          value: hasPercent ? Number(tax.percent) : amtPaise,
          amountPaise: amtPaise,
          rawValue: hasPercent ? String(tax.percent) : (amtPaise / 100).toFixed(2),
        });
      }
    }
  }

  // Add Service Charge
  const svcPaise = Math.round((Number(parsedData.serviceChargeRupees) || 0) * 100);
  if (svcPaise > 0) {
    charges.push({
      id: nanoid(8),
      kind: 'service',
      label: 'Service Charge',
      basis: 'fixed',
      value: svcPaise,
      amountPaise: svcPaise,
      rawValue: (svcPaise / 100).toFixed(2),
    });
  }

  // Add Discount
  const discPaise = Math.round((Number(parsedData.discountRupees) || 0) * 100);
  if (discPaise > 0) {
    charges.push({
      id: nanoid(8),
      kind: 'discount',
      label: 'Discount',
      basis: 'fixed',
      value: discPaise,
      amountPaise: discPaise,
      rawValue: (discPaise / 100).toFixed(2),
    });
  }

  // Add Tip
  const tipPaise = Math.round((Number(parsedData.tipRupees) || 0) * 100);
  if (tipPaise > 0) {
    charges.push({
      id: nanoid(8),
      kind: 'tip',
      label: 'Tip',
      basis: 'fixed',
      value: tipPaise,
      amountPaise: tipPaise,
      rawValue: (tipPaise / 100).toFixed(2),
    });
  }

  const printedTotalPaise = Math.round((Number(parsedData.grandTotalRupees) || 0) * 100);

  return {
    items,
    charges,
    printedTotalPaise,
    rawText: rawJson,
  };
}
