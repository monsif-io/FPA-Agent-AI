import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';

// GET /api/billing/clients — list all billing clients
export async function GET(req: NextRequest) {
  try {
    const db = getDb();
    const url = new URL(req.url);
    const search = url.searchParams.get('search') || '';
    const active = url.searchParams.get('active');

    let query = 'SELECT * FROM billing_clients';
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (active !== null) {
      conditions.push('is_active = ?');
      params.push(active === 'true' ? 1 : 0);
    }

    if (search) {
      conditions.push('(name LIKE ? OR abbreviation LIKE ? OR email LIKE ? OR contact_person LIKE ?)');
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY name ASC';

    const clients = db.prepare(query).all(...params);
    return NextResponse.json({ clients });
  } catch (error) {
    console.error('Billing clients list error:', error);
    return NextResponse.json({ error: 'Failed to fetch billing clients' }, { status: 500 });
  }
}

// POST /api/billing/clients — create a new billing client
export async function POST(req: NextRequest) {
  try {
    const db = getDb();
    const body = await req.json();

    const { name, abbreviation, contact_person, contact_civility, email, phone, address, city, country, ice, rc, if_number, notes } = body;

    if (!name || !email) {
      return NextResponse.json({ error: 'Name and email are required' }, { status: 400 });
    }

    const result = db.prepare(`
      INSERT INTO billing_clients (name, abbreviation, contact_person, contact_civility, email, phone, address, city, country, ice, rc, if_number, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name,
      abbreviation || '',
      contact_person || '',
      contact_civility || 'M.',
      email,
      phone || '',
      address || '',
      city || 'Casablanca',
      country || 'Maroc',
      ice || '',
      rc || '',
      if_number || '',
      notes || ''
    );

    const client = db.prepare('SELECT * FROM billing_clients WHERE id = ?').get(result.lastInsertRowid);

    // Log activity
    db.prepare('INSERT INTO billing_activity_log (action, client_id, details) VALUES (?, ?, ?)').run(
      'client_created', result.lastInsertRowid, `Client "${name}" créé`
    );

    return NextResponse.json({ client }, { status: 201 });
  } catch (error) {
    console.error('Create billing client error:', error);
    return NextResponse.json({ error: 'Failed to create billing client' }, { status: 500 });
  }
}
