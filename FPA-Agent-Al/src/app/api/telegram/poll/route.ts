import { NextResponse } from 'next/server';
import getDb from '@/lib/db';

// POST /api/telegram/poll - Poll for new messages and process them (for local development without webhook)
export async function POST() {
  try {
    const db = getDb();
    const getSetting = (key: string): string => {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
      return row?.value || '';
    };

    const botToken = getSetting('telegram_bot_token');
    if (!botToken) {
      return NextResponse.json({ error: 'Bot token not configured' }, { status: 400 });
    }

    // Get updates from Telegram (include callback_query)
    const lastUpdateId = getSetting('telegram_last_update_id');
    const offset = lastUpdateId ? parseInt(lastUpdateId) + 1 : undefined;

    const params = new URLSearchParams();
    if (offset) params.set('offset', String(offset));
    params.set('timeout', '0');
    params.set('limit', '10');
    params.set('allowed_updates', JSON.stringify(['message', 'callback_query']));

    const response = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates?${params}`);
    const data = await response.json();

    if (!data.ok || !data.result || data.result.length === 0) {
      return NextResponse.json({ processed: 0, message: 'No new messages' });
    }

    let processed = 0;
    const errors: string[] = [];

    for (const update of data.result) {
      // Save the last update ID immediately
      db.prepare("INSERT OR REPLACE INTO settings (key, value, category, updated_at) VALUES ('telegram_last_update_id', ?, 'telegram', datetime('now'))").run(String(update.update_id));

      // Forward to webhook handler
      try {
        const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
        const webhookRes = await fetch(`${baseUrl}/api/telegram/webhook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(update),
        });
        if (webhookRes.ok) {
          processed++;
        } else {
          const errText = await webhookRes.text();
          errors.push(`Update ${update.update_id}: ${errText.substring(0, 100)}`);
        }
      } catch (err) {
        console.error('[TELEGRAM-POLL] Error processing update:', err);
        errors.push(`Update ${update.update_id}: ${String(err).substring(0, 100)}`);
      }
    }

    return NextResponse.json({ 
      processed, 
      total: data.result.length,
      ...(errors.length > 0 ? { errors } : {}),
    });
  } catch (error) {
    console.error('[TELEGRAM-POLL] Error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// GET /api/telegram/poll - Auto-poll endpoint (called by dashboard polling)
export async function GET() {
  // Redirect to POST for simplicity
  try {
    const db = getDb();
    const getSetting = (key: string): string => {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
      return row?.value || '';
    };

    const botToken = getSetting('telegram_bot_token');
    if (!botToken) {
      return NextResponse.json({ error: 'Bot token not configured' }, { status: 400 });
    }

    const lastUpdateId = getSetting('telegram_last_update_id');
    const offset = lastUpdateId ? parseInt(lastUpdateId) + 1 : undefined;

    const params = new URLSearchParams();
    if (offset) params.set('offset', String(offset));
    params.set('timeout', '0');
    params.set('limit', '10');
    params.set('allowed_updates', JSON.stringify(['message', 'callback_query']));

    const response = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates?${params}`);
    const data = await response.json();

    if (!data.ok || !data.result || data.result.length === 0) {
      return NextResponse.json({ processed: 0 });
    }

    let processed = 0;

    for (const update of data.result) {
      db.prepare("INSERT OR REPLACE INTO settings (key, value, category, updated_at) VALUES ('telegram_last_update_id', ?, 'telegram', datetime('now'))").run(String(update.update_id));

      try {
        const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
        const webhookRes = await fetch(`${baseUrl}/api/telegram/webhook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(update),
        });
        if (webhookRes.ok) processed++;
      } catch (err) {
        console.error('[TELEGRAM-POLL] Error:', err);
      }
    }

    return NextResponse.json({ processed, total: data.result.length });
  } catch (error) {
    console.error('[TELEGRAM-POLL] Error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
