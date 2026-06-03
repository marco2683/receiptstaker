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
  date: string;
  vendor: string;
  description: string;
  items: Array<{ name: string; amount: number }>;
  amountIncGst: number;
  gst: number | null;
  payment_method: string | null;
  category: string;
  subCategory: string;
  businessPct: number;
  confidence: number;     // 0.0-1.0 how confident the AI is
  confidence_notes: string; // Why confidence is low (if applicable)
}

export async function extractReceiptData(imagePath: string): Promise<ExtractedReceiptData> {
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');
  
  const ext = imagePath.toLowerCase().split('.').pop();
  const mimeType = ext === 'png' ? 'image/png' : 
                   ext === 'webp' ? 'image/webp' : 
                   ext === 'gif' ? 'image/gif' : 'image/jpeg';

  const response = await getClient().chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are an expert receipt parser for Australian business tax accounting.
Extract structured data from receipt images.
Always respond with valid JSON only, no markdown formatting or code blocks.
Use Australian date format awareness (DD/MM/YYYY) and convert to YYYY-MM-DD.
Currency is AUD. If GST is not explicitly stated, estimate as total/11 (10% GST).

IMPORTANT: Rate your confidence from 0.0 to 1.0:
- 1.0 = crystal clear receipt, all fields readable
- 0.8 = mostly clear, minor guesses on 1-2 fields
- 0.5 = partially readable, several fields estimated
- 0.3 = blurry/partial, most fields guessed
- 0.1 = barely readable, almost everything guessed

If confidence < 0.7, explain why in "confidence_notes".

For "category" pick ONE of:
- OPERATING_EXPENSE
- MOTOR_VEHICLE_EXPENSE
- HEALTH_RELATED_EXPENSE
- TRAVEL_EXPENSE
- SUPERANNUATION_CONTRIBUTIONS
- HOME_OFFICE_EXPENSE

For "subCategory", pick from these:

OPERATING_EXPENSE: Stationary, Software, IT Accessories, Mobile Bill, Tools, 
  Project Related Consumables, Subscriptions & Business Resources, Bank Fee, 
  Project Parts, Office, Project Costs, Clothing, Insurance, Materials & Consumables, 
  Security, Operating Costs, Mobile Phone Accessories, PPE, Cleaning Supplies, 
  First Aid Supplies, COGS, Office Equipment, Business related meals, 
  Software subscriptions, Computers / Mobiles, Advertising & Marketing, 
  Accounting & Book Keeping Fees, Operating Equipment, Dry cleaning, Spare parts

MOTOR_VEHICLE_EXPENSE: Vehicle Registration, Vehicle Insurance, Fuel, Tolls,
  Vehicle Repair & Maintenance, Vehicle Accessories, Parking

HEALTH_RELATED_EXPENSE: Private Health Insurance, Ambulance Cover

TRAVEL_EXPENSE: Taxis Uber hire car, Meals, Accomodation, Flights,
  Business related travel expense, Public Transport, Car parking, Travel Fuel

HOME_OFFICE_EXPENSE: Gas, Electricity, Water, NBN Internet

For "businessPct", estimate business-use percentage (0.0-1.0). Default 1.0.
For "description", create a brief 3-5 word summary.`
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Extract all data from this receipt. Return JSON:
{
  "date": "YYYY-MM-DD",
  "vendor": "Store Name",
  "description": "Brief summary",
  "items": [{"name": "Item", "amount": 12.50}],
  "amountIncGst": 110.00,
  "gst": 10.00,
  "payment_method": "VISA/CASH/etc or null",
  "category": "OPERATING_EXPENSE",
  "subCategory": "Materials & Consumables",
  "businessPct": 1.0,
  "confidence": 0.9,
  "confidence_notes": ""
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
    const cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const data = JSON.parse(cleaned) as ExtractedReceiptData;
    
    if (!data.date || !data.vendor || !data.amountIncGst) {
      throw new Error('Missing required fields in extracted data');
    }

    // Ensure confidence is a number
    if (typeof data.confidence !== 'number') data.confidence = 0.5;
    
    return data;
  } catch (parseError) {
    console.error('Failed to parse OCR response:', content);
    throw new Error(`Failed to parse receipt data: ${parseError}`);
  }
}
