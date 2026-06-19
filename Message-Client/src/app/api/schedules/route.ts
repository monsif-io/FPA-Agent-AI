import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';

// GET /api/schedules
export async function GET() {
  try {
    const db = getDb();
    const schedules = db.prepare(`
      SELECT s.*, c.name as client_name, c.company as client_company, c.email as client_email,
             c.amount_due, c.currency, c.status as client_status, c.escalation_level,
             t.name as template_name
      FROM schedules s
      LEFT JOIN clients c ON s.client_id = c.id
      LEFT JOIN templates t ON s.template_id = t.id
      ORDER BY s.next_run ASC
    `).all();
    return NextResponse.json({ schedules });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// PUT /api/schedules  
export async function PUT(req: NextRequest) {
  try {
    const db = getDb();
    const body = await req.json();
    const { id, frequency, timeOfDay, isActive, templateId, runNow } = body;

    if (!id) return NextResponse.json({ error: 'ID requis' }, { status: 400 });

    const fields = [];
    const values: (string | number)[] = [];

    if (frequency !== undefined) { fields.push('frequency = ?'); values.push(frequency); }
    if (timeOfDay !== undefined) { fields.push('time_of_day = ?'); values.push(timeOfDay); }
    if (isActive !== undefined) { fields.push('is_active = ?'); values.push(isActive ? 1 : 0); }
    if (templateId !== undefined) { fields.push('template_id = ?'); values.push(templateId); }
    if (runNow === true) { fields.push("next_run = datetime('now')"); }

    if (fields.length > 0) {
      values.push(id);
      db.prepare(`UPDATE schedules SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
