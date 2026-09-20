import { ImapFlow } from 'imapflow';
// @ts-ignore
import { simpleParser, ParsedMail } from 'mailparser';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { getDatabase, saveDatabase } from '../database/schema';
import { extractReceiptData, ExtractedReceiptData } from './ocr';
import { storeReceipt, initializeCompanyStorage } from './storage';
import { appendReceiptRow, initializeCompanySpreadsheet } from './spreadsheet';


// Keywords to search for in emails
const RECEIPT_KEYWORDS = [
  'receipt', 'invoice', 'tax invoice', 'order confirmation',
  'payment confirmation', 'purchase', 'transaction',
  'your order', 'booking confirmation',
  'payment received', 'billing', 'subscription',
  'your bill', 'statement', 'payment summary',
  'delivery confirmation', 'shipping confirmation',
  'refund', 'credit note', 'charge',
  'renewal', 'membership', 'plan',
  'ticket', 'reservation', 'itinerary',
  'eftpos', 'paid', 'amount due',
];

// Known receipt sender domains
const KNOWN_SENDERS = [
  'uber.com', 'ubereats.com', 'amazon.com', 'amazon.com.au',
  'bunnings.com.au', 'officeworks.com.au', 'kmart.com.au',
  'woolworths.com.au', 'coles.com.au', 'telstra.com',
  'optus.com.au', 'vodafone.com.au', 'paypal.com',
  'afterpay.com', 'square.com', 'stripe.com',
  'qantas.com', 'jetstar.com', 'virginaustralia.com',
  'noreply', 'no-reply', 'receipts@', 'invoice@'
];

interface EmailAccount {
  id: string;
  company_id: string;
  email: string;
  imap_host: string;
  imap_port: number;
  imap_user: string;
  imap_pass: string;
  label: string;
  last_scan_at: string | null;
}

interface ScanResult {
  total_emails_checked: number;
  receipts_found: number;
  receipts_saved: number;
  errors: string[];
  details: Array<{
    subject: string;
    from: string;
    status: 'saved' | 'skipped' | 'error';
    receipt_id?: string;
    error?: string;
  }>;
}

/**
 * Test IMAP connection with given credentials
 */
export async function testImapConnection(host: string, port: number, user: string, pass: string): Promise<{ success: boolean; error?: string }> {
  let client: ImapFlow | null = null;
  try {
    console.log(`🔌 Testing IMAP connection: ${user} @ ${host}:${port}`);
    client = new ImapFlow({
      host,
      port,
      secure: true,
      auth: { user, pass },
      logger: false,
      tls: { rejectUnauthorized: false },
      connectionTimeout: 10000,
    });
    await client.connect();
    console.log(`✅ IMAP connection successful: ${user}`);
    await client.logout();
    return { success: true };
  } catch (err: any) {
    const msg = err.message || 'Connection failed';
    console.error(`❌ IMAP connection failed for ${user}@${host}: ${msg}`);

    // Provide helpful error messages
    let hint = msg;
    if (msg.includes('AUTHENTICATIONFAILED') || msg.includes('Invalid credentials') || msg.includes('NO ')) {
      hint = 'Authentication failed. For Gmail, you must use an App Password (not your regular password). Go to Google Account → Security → 2-Step Verification → App Passwords.';
    } else if (msg.includes('ENOTFOUND') || msg.includes('getaddrinfo')) {
      hint = `Server "${host}" not found. Check the IMAP hostname.`;
    } else if (msg.includes('ETIMEDOUT') || msg.includes('timeout')) {
      hint = 'Connection timed out. Check the server address and port.';
    } else if (msg.includes('ECONNREFUSED')) {
      hint = `Connection refused on port ${port}. Make sure IMAP is enabled in your email settings.`;
    }

    return { success: false, error: hint };
  } finally {
    if (client) {
      try { await client.logout(); } catch {}
    }
  }
}

/**
 * Build IMAP search query for receipt-like emails
 */
function buildSearchQuery(sinceDate: Date): any {
  return {
    since: sinceDate,
    or: RECEIPT_KEYWORDS.map(kw => ({ subject: kw }))
  };
}

/**
 * Check if an email looks like a receipt based on sender/subject
 */
function looksLikeReceipt(from: string, subject: string): boolean {
  const fromLower = from.toLowerCase();
  const subjectLower = subject.toLowerCase();

  // Check known senders
  if (KNOWN_SENDERS.some(s => fromLower.includes(s))) return true;

  // Check subject keywords
  if (RECEIPT_KEYWORDS.some(kw => subjectLower.includes(kw))) return true;

  return false;
}

/**
 * Extract receipt data from email HTML body using GPT
 */
async function extractFromEmailBody(subject: string, from: string, htmlBody: string, textBody: string): Promise<ExtractedReceiptData | null> {
  const OpenAI = (await import('openai')).default;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === 'sk-your-api-key-here') return null;

  const client = new OpenAI({ apiKey });

  // Use text body if available, fall back to html (stripped)
  let content = textBody || htmlBody.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').substring(0, 4000);

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are an expert receipt parser for Australian business tax accounting.
Extract structured data from email content that contains receipts, invoices, or order confirmations.
Always respond with valid JSON only.

CRITICAL DATE RULE: This is an AUSTRALIAN business. Dates are DD/MM/YYYY (day first, month second).
- "04/06/2026" means 4th June 2026 → output "2026-06-04"
- "12/03/2025" means 12th March 2025 → output "2025-03-12"  
- NEVER interpret DD/MM as MM/DD. The first number is ALWAYS the day.
Today's date is ${new Date().toISOString().split('T')[0]} for reference.

Currency is AUD. If GST is not explicitly stated, estimate as total/11 (10% GST).

If the email does NOT contain a receipt/invoice/purchase, respond with: {"is_receipt": false}

For category pick ONE of: OPERATING_EXPENSE, MOTOR_VEHICLE_EXPENSE, HEALTH_RELATED_EXPENSE, TRAVEL_EXPENSE, SUPERANNUATION_CONTRIBUTIONS, HOME_OFFICE_EXPENSE

For subCategory, pick the most appropriate from:
OPERATING_EXPENSE: Software, IT Accessories, Mobile Bill, Tools, Subscriptions & Business Resources, Office, Clothing, Insurance, Materials & Consumables, Software subscriptions
MOTOR_VEHICLE_EXPENSE: Fuel, Tolls, Vehicle Registration, Vehicle Insurance, Parking
TRAVEL_EXPENSE: Taxis Uber hire car, Meals, Accomodation, Flights, Public Transport
HOME_OFFICE_EXPENSE: NBN Internet, Electricity, Gas, Water`
      },
      {
        role: 'user',
        content: `Email from: ${from}
Subject: ${subject}

Content:
${content}

Extract receipt data. Return JSON:
{
  "is_receipt": true,
  "date": "YYYY-MM-DD",
  "vendor": "Store Name",
  "description": "Brief summary",
  "items": [{"name": "Item", "amount": 12.50}],
  "amountIncGst": 110.00,
  "gst": 10.00,
  "payment_method": null,
  "category": "OPERATING_EXPENSE",
  "subCategory": "Software",
  "businessPct": 1.0,
  "confidence": 0.8,
  "confidence_notes": ""
}`
      }
    ],
    max_tokens: 800,
    temperature: 0.1,
  });

  const responseContent = response.choices[0]?.message?.content;
  if (!responseContent) return null;

  try {
    const cleaned = responseContent.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const data = JSON.parse(cleaned);
    if (data.is_receipt === false) return null;
    if (!data.date || !data.vendor || !data.amountIncGst) return null;
    return data as ExtractedReceiptData;
  } catch {
    return null;
  }
}

/**
 * Render an email HTML body to a screenshot image using Puppeteer
 */
async function renderEmailToImage(htmlBody: string): Promise<string | null> {
  let browser = null;
  try {
    const puppeteer = await import('puppeteer');
    browser = await puppeteer.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 800, height: 600 });

    // Wrap email HTML in a clean container
    const wrappedHtml = `
      <!DOCTYPE html>
      <html><head>
        <meta charset="utf-8">
        <style>
          body { margin: 0; padding: 16px; background: white; font-family: Arial, sans-serif; }
          img { max-width: 100% !important; height: auto !important; }
          table { max-width: 100% !important; }
        </style>
      </head><body>${htmlBody}</body></html>
    `;

    await page.setContent(wrappedHtml, { waitUntil: 'networkidle0' as any, timeout: 15000 });

    // Get actual content height for full-page screenshot
    const bodyHeight = await page.evaluate(() => (globalThis as any).document?.body?.scrollHeight || 600);
    await page.setViewport({ width: 800, height: Math.min(bodyHeight + 40, 5000) });

    const tmpDir = path.join(os.tmpdir(), 'receipt-taker-attachments');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const screenshotPath = path.join(tmpDir, `email-${uuidv4()}.jpg`);

    await page.screenshot({
      path: screenshotPath,
      type: 'jpeg',
      quality: 85,
      fullPage: true,
    });

    await browser.close();
    console.log(`    📸 Email rendered to image: ${screenshotPath}`);
    return screenshotPath;
  } catch (err: any) {
    if (browser) try { await browser.close(); } catch {}
    console.error(`    ⚠️ Email screenshot error: ${err.message}`);
    return null;
  }
}

/**
 * Save an attachment to a temp file for OCR processing
 */
function saveTempAttachment(attachment: any): string | null {
  try {
    const tmpDir = path.join(os.tmpdir(), 'receipt-taker-attachments');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const ext = path.extname(attachment.filename || '.bin').toLowerCase();
    const validExts = ['.jpg', '.jpeg', '.png', '.webp', '.pdf', '.gif'];
    if (!validExts.includes(ext)) return null;

    const tmpPath = path.join(tmpDir, `${uuidv4()}${ext}`);
    fs.writeFileSync(tmpPath, attachment.content);
    return tmpPath;
  } catch {
    return null;
  }
}

/**
 * Scan a single email account for receipt-like emails
 */
export async function scanEmailAccount(account: EmailAccount, userId: string): Promise<ScanResult> {
  const result: ScanResult = {
    total_emails_checked: 0,
    receipts_found: 0,
    receipts_saved: 0,
    errors: [],
    details: []
  };

  let client: ImapFlow | null = null;

  try {
    client = new ImapFlow({
      host: account.imap_host,
      port: account.imap_port,
      secure: true,
      auth: { user: account.imap_user, pass: account.imap_pass },
      logger: false,
      tls: { rejectUnauthorized: false }
    });

    await client.connect();
    console.log(`📧 Connected to ${account.email} (${account.imap_host})`);

    // Open INBOX
    const lock = await client.getMailboxLock('INBOX');

    try {
      // Search for receipt-like emails from the last 30 days (or since last scan)
      const sinceDate = account.last_scan_at
        ? new Date(account.last_scan_at)
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

      const db = await getDatabase();

      // Search with keywords
      let messageUids: number[] = [];
      for (const keyword of RECEIPT_KEYWORDS) {
        try {
          const results = (await client.search({
            since: sinceDate,
            subject: keyword
          })) || [];
          for (const uid of results) {
            if (!messageUids.includes(uid)) messageUids.push(uid);
          }
        } catch {
          // Some servers don't support all search criteria
        }
      }

      console.log(`📬 Found ${messageUids.length} potential receipt emails since ${sinceDate.toISOString().split('T')[0]}`);

      for (const uid of messageUids) {
        result.total_emails_checked++;

        try {
          // Fetch the full message
          const message = await client.fetchOne(String(uid), {
            source: true,
            envelope: true,
            uid: true
          });

          if (!message || !message.source) continue;

          const parsed: ParsedMail = await simpleParser(message.source);
          const messageId = parsed.messageId || `uid-${uid}-${account.id}`;
          const subject = parsed.subject || '(no subject)';
          const from = parsed.from?.text || '';
          const emailDate = parsed.date?.toISOString() || new Date().toISOString();

          // Check if already processed
          const existing = db.exec(
            'SELECT id FROM processed_emails WHERE email_account_id = ? AND message_id = ?',
            [account.id, messageId]
          );
          if (existing.length > 0 && existing[0].values.length > 0) {
            continue; // Skip already processed
          }

          // Check if it looks like a receipt
          if (!looksLikeReceipt(from, subject)) {
            continue;
          }

          result.receipts_found++;
          console.log(`  📩 Processing: "${subject}" from ${from}`);

          let receiptData: ExtractedReceiptData | null = null;
          let receiptFilename: string | null = null;

          // Strategy 1: Check for image/PDF attachments → OCR
          const imageAttachments = (parsed.attachments || []).filter((a: any) => {
            const ct = (a.contentType || '').toLowerCase();
            return ct.startsWith('image/') || ct === 'application/pdf';
          });

          if (imageAttachments.length > 0) {
            // OCR the first image/PDF attachment
            const attachment = imageAttachments[0];
            const tmpPath = saveTempAttachment(attachment);
            if (tmpPath) {
              try {
                receiptData = await extractReceiptData(tmpPath);
                // Store the attachment as the receipt image
                const storedFilename = await storeReceipt(tmpPath, receiptData.date, receiptData.vendor, receiptData.description, account.company_id);
                receiptFilename = storedFilename;
              } catch (err: any) {
                console.log(`    ⚠️ OCR failed for attachment: ${err.message}`);
              } finally {
                // Clean up temp file
                try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch {}
              }
            }
          }

          // Strategy 2: Parse email body with GPT if no attachment worked
          if (!receiptData) {
            const htmlBody = parsed.html || '';
            const textBody = parsed.text || '';
            if (htmlBody || textBody) {
              try {
                receiptData = await extractFromEmailBody(subject, from, htmlBody as string, textBody);

                // If we extracted data from HTML, render the email to an image
                if (receiptData && htmlBody) {
                  try {
                    const screenshotPath = await renderEmailToImage(htmlBody as string);
                    if (screenshotPath) {
                      const storedFilename = await storeReceipt(
                        screenshotPath, receiptData.date, receiptData.vendor,
                        receiptData.description, account.company_id
                      );
                      receiptFilename = storedFilename;
                      console.log(`    📸 Email screenshot saved: ${storedFilename}`);
                      // Clean up temp screenshot
                      try { if (fs.existsSync(screenshotPath)) fs.unlinkSync(screenshotPath); } catch {}
                    }
                  } catch (err: any) {
                    console.log(`    ⚠️ Screenshot failed (data still saved): ${err.message}`);
                  }
                }
              } catch (err: any) {
                console.log(`    ⚠️ Body extraction failed: ${err.message}`);
              }
            }
          }

          if (receiptData) {
            // Save to database and spreadsheet
            const receiptId = uuidv4().substring(0, 8);

            try {
              await initializeCompanySpreadsheet(account.company_id);
              initializeCompanyStorage(account.company_id);

              const rowNumber = await appendReceiptRow({
                id: receiptId,
                date: receiptData.date,
                description: receiptData.description,
                vendor: receiptData.vendor,
                category: receiptData.category,
                subCategory: receiptData.subCategory,
                amountIncGst: receiptData.amountIncGst,
                gst: receiptData.gst,
                businessPct: receiptData.businessPct,
                confidence: receiptData.confidence,
                receiptFilename,
                notes: `[EMAIL] From: ${from} | ${receiptData.confidence_notes || ''}`.trim(),
              }, account.company_id);

              db.run(
                `INSERT INTO receipts (id, company_id, date, description, vendor, category, sub_category,
                 amount_inc_gst, gst, business_pct, confidence, needs_review,
                 notes, receipt_filename, spreadsheet_row, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [receiptId, account.company_id, receiptData.date,
                 receiptData.description || '', receiptData.vendor,
                 receiptData.category, receiptData.subCategory || '',
                 receiptData.amountIncGst, receiptData.gst,
                 receiptData.businessPct || 1.0,
                 receiptData.confidence, receiptData.confidence < 0.7 ? 1 : 0,
                 `[EMAIL] From: ${from} | ${receiptData.confidence_notes || ''}`.trim(),
                 receiptFilename, rowNumber, userId]
              );

              // Track processed email
              db.run(
                `INSERT INTO processed_emails (id, email_account_id, company_id, message_id, subject, sender, email_date, status, receipt_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [uuidv4().substring(0, 12), account.id, account.company_id, messageId,
                 subject, from, emailDate, 'saved', receiptId]
              );
              saveDatabase();

              result.receipts_saved++;
              result.details.push({ subject, from, status: 'saved', receipt_id: receiptId });
              console.log(`    ✅ Saved: ${receiptData.vendor} $${receiptData.amountIncGst} → Row ${rowNumber}`);
            } catch (err: any) {
              result.errors.push(`Save failed for "${subject}": ${err.message}`);
              result.details.push({ subject, from, status: 'error', error: err.message });

              db.run(
                `INSERT INTO processed_emails (id, email_account_id, company_id, message_id, subject, sender, email_date, status, error)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [uuidv4().substring(0, 12), account.id, account.company_id, messageId,
                 subject, from, emailDate, 'error', err.message]
              );
              saveDatabase();
            }
          } else {
            // Not a parseable receipt — record as skipped
            db.run(
              `INSERT INTO processed_emails (id, email_account_id, company_id, message_id, subject, sender, email_date, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [uuidv4().substring(0, 12), account.id, account.company_id, messageId,
               subject, from, emailDate, 'skipped']
            );
            saveDatabase();
            result.details.push({ subject, from, status: 'skipped' });
          }
        } catch (err: any) {
          result.errors.push(`Failed to process email UID ${uid}: ${err.message}`);
        }
      }

      // Update last_scan_at
      db.run(
        "UPDATE email_accounts SET last_scan_at = datetime('now') WHERE id = ?",
        [account.id]
      );
      saveDatabase();

    } finally {
      lock.release();
    }

    await client.logout();
  } catch (err: any) {
    result.errors.push(`IMAP connection error: ${err.message}`);
    console.error(`❌ Email scan failed for ${account.email}: ${err.message}`);
  }

  console.log(`📧 Scan complete for ${account.email}: ${result.receipts_saved} receipts saved, ${result.errors.length} errors`);
  return result;
}
