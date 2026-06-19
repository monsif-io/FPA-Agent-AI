import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';

// GET /api/messages
export async function GET(req: NextRequest) {
  try {
    const db = getDb();
    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const status = url.searchParams.get('status') || '';
    const clientId = url.searchParams.get('clientId') || '';
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE 1=1';
    const params: (string | number)[] = [];

    if (status) { whereClause += ' AND ml.status = ?'; params.push(status); }
    if (clientId) { whereClause += ' AND ml.client_id = ?'; params.push(clientId); }

    const countQuery = `SELECT COUNT(*) as total FROM message_logs ml LEFT JOIN clients c ON ml.client_id = c.id ${whereClause}`;
    const countResult = db.prepare(countQuery).get(...params) as { total: number } | undefined;
    const total = countResult?.total || 0;

    const dataQuery = `
      SELECT ml.*, c.name as client_name, c.company as client_company, c.email as client_email
      FROM message_logs ml
      LEFT JOIN clients c ON ml.client_id = c.id
      ${whereClause}
      ORDER BY ml.sent_at DESC LIMIT ? OFFSET ?
    `;
    const messages = db.prepare(dataQuery).all(...params, limit, offset);

    return NextResponse.json({
      messages,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ messages: [], total: 0, page: 1, totalPages: 0 });
  }
}
