import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';

// GET /api/notifications - Get all notifications
export async function GET(req: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(req.url);
    const unreadOnly = searchParams.get('unread') === 'true';
    const limit = parseInt(searchParams.get('limit') || '50');

    const where = unreadOnly ? 'WHERE n.is_read = 0' : '';
    const notifications = db.prepare(`
      SELECT n.*, c.name as client_name, c.email as client_email
      FROM notifications n
      LEFT JOIN clients c ON n.client_id = c.id
      ${where}
      ORDER BY n.created_at DESC
      LIMIT ?
    `).all(limit);

    const unreadCount = (db.prepare('SELECT COUNT(*) as c FROM notifications WHERE is_read = 0').get() as { c: number }).c;

    return NextResponse.json({ notifications, unreadCount });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// PUT /api/notifications - Mark notifications as read
export async function PUT(req: NextRequest) {
  try {
    const db = getDb();
    const body = await req.json();
    const { id, markAllRead } = body;

    if (markAllRead) {
      db.prepare('UPDATE notifications SET is_read = 1').run();
    } else if (id) {
      db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(id);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
