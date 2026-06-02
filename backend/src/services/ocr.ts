import OpenAI from 'openai';
import fs from 'fs';

let _openai: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey === 'sk-your-api-key-here') {
      throw new Error('OpenAI API key not configured. Set OPENAI_API_KEY in backend/.env');
    }
    _openai = new OpenAI({ apiKey });
  }
  return _openai;
}

export interface ExtractedReceiptData {
  date: string;          // YYYY-MM-DD
  vendor: string;
  description: string;
  items: Array<{ name: string; amount: number }>;
  subtotal: number | null;
  gst: number | null;
  total: number;
  payment_method: string | null;
  category_guess: string;
}

export async function extractReceiptData(imagePath: string): Promise<ExtractedReceiptData> {
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');
  
  // Detect MIME type from extension
  const ext = imagePath.toLowerCase().split('.').pop();
  const mimeType = ext === 'png' ? 'image/png' : 
                   ext === 'webp' ? 'image/webp' : 
                   ext === 'gif' ? 'image/gif' : 'image/jpeg';

  const response = await getClient().chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are an expert receipt parser. Extract structured data from receipt images.
Always respond with valid JSON only, no markdown formatting or code blocks.
Use Australian date format awareness (DD/MM/YYYY) and convert to YYYY-MM-DD.
Currency is AUD. If GST is not visible, estimate as total/11 (10% GST).
For category, pick one of: Materials & Supplies, Tools & Equipment, Office Supplies, 
Travel & Transport, Meals & Entertainment, Professional Services, Utilities, 
Insurance, Rent & Property, Vehicle & Fuel, Other.
For description, create a brief 3-5 word summary of what was purchased.`
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Extract all data from this receipt. Return JSON with this exact structure:
{
  "date": "YYYY-MM-DD",
  "vendor": "Store/Business Name",
  "description": "Brief purchase summary",
  "items": [{"name": "Item name", "amount": 12.50}],
  "subtotal": 100.00,
  "gst": 10.00,
  "total": 110.00,
  "payment_method": "VISA/CASH/EFTPOS/etc or null",
  "category_guess": "Category from the predefined list"
}`
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${base64Image}`,
              detail: 'high'
            }
          }
        ]
      }
    ],
    max_tokens: 1000,
    temperature: 0.1,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from OCR API');
  }

  try {
    // Clean the response - remove markdown code blocks if present
    const cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const data = JSON.parse(cleaned) as ExtractedReceiptData;
    
    // Validate required fields
    if (!data.date || !data.vendor || !data.total) {
      throw new Error('Missing required fields in extracted data');
    }
    
    return data;
  } catch (parseError) {
    console.error('Failed to parse OCR response:', content);
    throw new Error(`Failed to parse receipt data: ${parseError}`);
  }
}
