import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';

// GET /api/pending-actions - List pending actions
export async function GET() {
  try {
    const db = getDb();
    const actions = db.prepare(`
      SELECT pa.*, c.name as client_name, c.email as client_email
      FROM pending_actions pa
      LEFT JOIN clients c ON pa.target_client_id = c.id
      ORDER BY pa.created_at DESC
      LIMIT 50
    `).all();

    const pending = (db.prepare("SELECT COUNT(*) as c FROM pending_actions WHERE status = 'pending'").get() as { c: number }).c;

    return NextResponse.json({ actions, pendingCount: pending });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// POST /api/pending-actions - Create a new pending action
export async function POST(req: NextRequest) {
  try {
    const db = getDb();
    const body = await req.json();
    const { actionType, source, targetClientId, data, previewText } = body;

    const result = db.prepare(`
      INSERT INTO pending_actions (action_type, source, target_client_id, data, preview_text, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `).run(actionType, source || 'dashboard', targetClientId || null, JSON.stringify(data), previewText || '');

    return NextResponse.json({ success: true, id: result.lastInsertRowid });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// PUT /api/pending-actions - Approve/reject/edit a pending action
export async function PUT(req: NextRequest) {
  try {
    const db = getDb();
    const body = await req.json();
    const { id, status, data } = body;

    if (!id || !status) {
      return NextResponse.json({ error: 'id and status required' }, { status: 400 });
    }

    if (data) {
      db.prepare("UPDATE pending_actions SET status = ?, data = ? WHERE id = ?").run(status, JSON.stringify(data), id);
    } else {
      db.prepare("UPDATE pending_actions SET status = ? WHERE id = ?").run(status, id);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
