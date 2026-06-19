import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';

// GET /api/settings
export async function GET(req: NextRequest) {
  try {
    const db = getDb();
    const url = new URL(req.url);
    const category = url.searchParams.get('category');

    let settings;
    if (category) {
      settings = db.prepare('SELECT * FROM settings WHERE category = ?').all(category);
    } else {
      settings = db.prepare('SELECT * FROM settings').all();
    }

    // Convert to key-value object
    const settingsObj: Record<string, string> = {};
    for (const s of settings as { key: string; value: string }[]) {
      settingsObj[s.key] = s.value;
    }

    return NextResponse.json({ settings: settingsObj, raw: settings });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// PUT /api/settings
export async function PUT(req: NextRequest) {
  try {
    const db = getDb();
    const body = await req.json();
    const { settings } = body;

    if (!settings || typeof settings !== 'object') {
      return NextResponse.json({ error: 'Settings object required' }, { status: 400 });
    }

    const upsert = db.prepare(`
      INSERT INTO settings (key, value, category, updated_at) 
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);

    const updateMany = db.transaction(() => {
      for (const [key, value] of Object.entries(settings)) {
        const category = key.startsWith('smtp_') || key.startsWith('imap_') || key.startsWith('admin_email') ? 'email'
          : key.startsWith('telegram_') ? 'telegram'
          : key.startsWith('notification_') ? 'notifications'
          : key.startsWith('openrouter_') ? 'ai'
          : 'general';
        upsert.run(key, value as string, category);
      }
    });

    updateMany();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
