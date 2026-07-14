import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';

// GET /api/templates
export async function GET() {
  try {
    const db = getDb();
    const templates = db.prepare('SELECT * FROM templates ORDER BY escalation_level ASC, created_at DESC').all();
    return NextResponse.json({ templates });
  } catch (error) {
    console.error('Error fetching templates:', error);
    return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 });
  }
}

// POST /api/templates
export async function POST(req: NextRequest) {
  try {
    const db = getDb();
    const body = await req.json();
    const { name, subject, body: templateBody, escalationLevel, language, isDefault } = body;

    if (!name || !subject || !templateBody) {
      return NextResponse.json({ error: 'Nom, sujet et corps requis' }, { status: 400 });
    }

    const result = db.prepare(`
      INSERT INTO templates (name, subject, body, escalation_level, language, is_default)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(name, subject, templateBody, escalationLevel || 'friendly', language || 'fr', isDefault ? 1 : 0);

    const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(result.lastInsertRowid);
    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    console.error('Error creating template:', error);
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 });
  }
}
