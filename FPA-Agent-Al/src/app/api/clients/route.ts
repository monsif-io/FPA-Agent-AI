import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';

// GET /api/clients - list all clients
export async function GET(req: NextRequest) {
  try {
    const db = getDb();
    const url = new URL(req.url);
    const search = url.searchParams.get('search') || '';
    const status = url.searchParams.get('status') || '';
    const escalation = url.searchParams.get('escalation') || '';
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = (page - 1) * limit;

    let query = 'SELECT * FROM clients WHERE 1=1';
    const params: (string | number)[] = [];

    if (search) {
      query += ' AND (name LIKE ? OR company LIKE ? OR email LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    if (escalation) {
      query += ' AND escalation_level = ?';
      params.push(escalation);
    }

    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total');
    const totalResult = db.prepare(countQuery).get(...params) as { total: number };

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const clients = db.prepare(query).all(...params);

    return NextResponse.json({
      clients,
      total: totalResult.total,
      page,
      limit,
      totalPages: Math.ceil(totalResult.total / limit),
    });
  } catch (error) {
    console.error('Error fetching clients:', error);
    return NextResponse.json({ error: 'Failed to fetch clients' }, { status: 500 });
  }
}

// POST /api/clients - create a new client
export async function POST(req: NextRequest) {
  try {
    const db = getDb();
    const body = await req.json();
    const { name, company, email, phone, amountDue, currency, status, escalationLevel, dueDate, notes, frequency, templateId, automationFlowId } = body;

    if (!name || !email) {
      return NextResponse.json({ error: 'Le nom et l\'email sont requis' }, { status: 400 });
    }

    // Resolve automation flow ID (default if none provided)
    const defaultFlow = db.prepare('SELECT id FROM automation_flows WHERE is_default = 1 LIMIT 1').get() as { id: number } | undefined;
    const flowId = automationFlowId || defaultFlow?.id || null;
    const currentStepIndex = 0;
    const flowStartedAt = flowId ? new Date().toISOString() : null;

    const result = db.prepare(`
      INSERT INTO clients (name, company, email, phone, amount_due, currency, status, escalation_level, due_date, notes, automation_flow_id, current_flow_step_index, flow_started_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name,
      company || '',
      email,
      phone || '',
      amountDue || 0,
      currency || 'MAD',
      status || 'pending',
      escalationLevel || 'friendly',
      dueDate || null,
      notes || '',
      flowId,
      currentStepIndex,
      flowStartedAt
    );

    const clientId = result.lastInsertRowid;

    // Create default schedule for this client
    const settings = db.prepare('SELECT value FROM settings WHERE key = ?');
    const defaultFreq = (settings.get('default_frequency') as { value: string })?.value || 'weekly';
    const defaultTime = (settings.get('default_send_time') as { value: string })?.value || '09:00';

    // Calculate delay from the first step of the flow if enrolled
    let delayStr = '+1 day';
    if (flowId) {
      const flow = db.prepare('SELECT steps FROM automation_flows WHERE id = ?').get(flowId) as { steps: string } | undefined;
      if (flow) {
        try {
          const steps = JSON.parse(flow.steps || '[]');
          if (steps.length > 0 && steps[0].delay_days !== undefined) {
            delayStr = `+${steps[0].delay_days} days`;
          }
        } catch (_) {}
      }
    }

    db.prepare(`
      INSERT INTO schedules (client_id, frequency, time_of_day, template_id, is_active, next_run)
      VALUES (?, ?, ?, ?, 1, datetime('now', ?))
    `).run(clientId, frequency || defaultFreq, defaultTime, templateId || null, delayStr);

    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);
    return NextResponse.json({ client }, { status: 201 });
  } catch (error) {
    console.error('Error creating client:', error);
    return NextResponse.json({ error: 'Failed to create client' }, { status: 500 });
  }
}
