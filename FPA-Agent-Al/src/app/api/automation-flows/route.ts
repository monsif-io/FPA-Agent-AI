import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';

// GET /api/automation-flows
export async function GET() {
  try {
    const db = getDb();
    const flows = db.prepare(`
      SELECT af.*, COUNT(c.id) as client_count 
      FROM automation_flows af 
      LEFT JOIN clients c ON af.id = c.automation_flow_id AND c.is_active = 1
      GROUP BY af.id
      ORDER BY af.is_default DESC, af.created_at DESC
    `).all();

    // Parse steps JSON string for each flow
    const parsedFlows = flows.map((f: any) => ({
      ...f,
      steps: JSON.parse(f.steps || '[]'),
      is_default: !!f.is_default
    }));

    return NextResponse.json({ flows: parsedFlows });
  } catch (error) {
    console.error('Error fetching automation flows:', error);
    return NextResponse.json({ error: 'Failed to fetch automation flows' }, { status: 500 });
  }
}

// POST /api/automation-flows
export async function POST(req: NextRequest) {
  try {
    const db = getDb();
    const body = await req.json();
    const { name, description, steps } = body;

    if (!name) {
      return NextResponse.json({ error: 'Le nom du flux est requis' }, { status: 400 });
    }

    if (!steps || !Array.isArray(steps) || steps.length === 0) {
      return NextResponse.json({ error: 'Au moins une étape est requise dans le flux' }, { status: 400 });
    }

    // Validate steps structure
    for (const step of steps) {
      if (typeof step.template_id !== 'number' || typeof step.delay_days !== 'number') {
        return NextResponse.json({ error: 'Format d\'étape invalide. Chaque étape doit avoir template_id (number) et delay_days (number)' }, { status: 400 });
      }
    }

    const result = db.prepare(`
      INSERT INTO automation_flows (name, description, steps, is_default)
      VALUES (?, ?, ?, 0)
    `).run(name, description || '', JSON.stringify(steps));

    const flow = db.prepare('SELECT * FROM automation_flows WHERE id = ?').get(result.lastInsertRowid) as any;
    if (flow) {
      flow.steps = JSON.parse(flow.steps);
      flow.is_default = !!flow.is_default;
    }

    return NextResponse.json({ flow }, { status: 201 });
  } catch (error) {
    console.error('Error creating automation flow:', error);
    return NextResponse.json({ error: 'Failed to create automation flow' }, { status: 500 });
  }
}
