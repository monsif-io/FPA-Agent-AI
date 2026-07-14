import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';

// POST /api/telegram/setup - Set webhook for Telegram bot
export async function POST(req: NextRequest) {
  try {
    const db = getDb();
    const body = await req.json();
    const { webhookUrl } = body;

    const getSetting = (key: string): string => {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
      return row?.value || '';
    };

    const botToken = getSetting('telegram_bot_token');
    if (!botToken) {
      return NextResponse.json({ error: 'Bot token not configured' }, { status: 400 });
    }

    const url = webhookUrl || `${process.env.NEXTAUTH_URL}/api/telegram/webhook`;

    const response = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error setting webhook:', error);
    return NextResponse.json({ error: 'Failed to set webhook' }, { status: 500 });
  }
}

// GET /api/telegram/setup - Get webhook info
export async function GET() {
  try {
    const db = getDb();
    const getSetting = (key: string): string => {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
      return row?.value || '';
    };

    const botToken = getSetting('telegram_bot_token');
    const response = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
