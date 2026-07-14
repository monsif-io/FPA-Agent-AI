import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';
import crypto from 'crypto';

// POST /api/telegram/link - Generate a link code for admin
export async function POST() {
  try {
    const db = getDb();
    const getSetting = (key: string): string => {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
      return row?.value || '';
    };

    const botToken = getSetting('telegram_bot_token');
    if (!botToken) {
      return NextResponse.json({ error: 'Bot Telegram non configuré' }, { status: 400 });
    }

    // Generate a 6-digit link code
    const linkCode = crypto.randomInt(100000, 999999).toString();
    
    // Store the link code in settings (expires after use)
    db.prepare("INSERT OR REPLACE INTO settings (key, value, category, updated_at) VALUES ('telegram_link_code', ?, 'telegram', datetime('now'))").run(linkCode);

    // Get bot username
    let botUsername = '';
    try {
      const botInfo = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
      const botData = await botInfo.json();
      botUsername = botData.result?.username || '';
    } catch {
      // ignore
    }

    return NextResponse.json({
      success: true,
      linkCode,
      botUsername,
      botLink: botUsername ? `https://t.me/${botUsername}` : '',
      instructions: `Ouvrez Telegram, cherchez @${botUsername}, et envoyez le code: ${linkCode}`,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// GET /api/telegram/link - Check link status
export async function GET() {
  try {
    const db = getDb();
    const getSetting = (key: string): string => {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
      return row?.value || '';
    };

    const adminChatId = getSetting('telegram_admin_chat_id');
    const botToken = getSetting('telegram_bot_token');
    
    let adminName = '';
    let adminUsername = '';
    
    // Get admin info from Telegram if linked
    if (adminChatId && botToken) {
      try {
        const chatInfo = await fetch(`https://api.telegram.org/bot${botToken}/getChat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: adminChatId }),
        });
        const chatData = await chatInfo.json();
        if (chatData.ok) {
          adminName = `${chatData.result?.first_name || ''} ${chatData.result?.last_name || ''}`.trim();
          adminUsername = chatData.result?.username || '';
        }
      } catch {
        // ignore
      }
    }

    return NextResponse.json({
      linked: !!adminChatId,
      chatId: adminChatId,
      adminName,
      adminUsername,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// DELETE /api/telegram/link - Unlink Telegram
export async function DELETE() {
  try {
    const db = getDb();
    db.prepare("UPDATE settings SET value = '', updated_at = datetime('now') WHERE key = 'telegram_admin_chat_id'").run();
    return NextResponse.json({ success: true, message: 'Telegram délié avec succès' });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
