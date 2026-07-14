import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';

// GET /api/templates/[id]
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(id);
    if (!template) return NextResponse.json({ error: 'Template non trouvé' }, { status: 404 });
    return NextResponse.json({ template });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// PUT /api/templates/[id]
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const body = await req.json();
    const { name, subject, body: templateBody, escalationLevel, language, isDefault } = body;

    db.prepare(`
      UPDATE templates SET name = ?, subject = ?, body = ?, escalation_level = ?, language = ?, is_default = ?
      WHERE id = ?
    `).run(name, subject, templateBody, escalationLevel || 'friendly', language || 'fr', isDefault ? 1 : 0, id);

    const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(id);
    return NextResponse.json({ template });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// DELETE /api/templates/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    db.prepare('DELETE FROM templates WHERE id = ?').run(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
