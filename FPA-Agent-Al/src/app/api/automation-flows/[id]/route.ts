import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';

// GET /api/automation-flows/[id]
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const flow = db.prepare('SELECT * FROM automation_flows WHERE id = ?').get(id) as any;

    if (!flow) {
      return NextResponse.json({ error: 'Flux non trouvé' }, { status: 404 });
    }

    flow.steps = JSON.parse(flow.steps || '[]');
    flow.is_default = !!flow.is_default;

    return NextResponse.json({ flow });
  } catch (error) {
    console.error('Error fetching automation flow:', error);
    return NextResponse.json({ error: 'Failed to fetch automation flow' }, { status: 500 });
  }
}

// PUT /api/automation-flows/[id]
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const body = await req.json();
    const { name, description, steps } = body;

    const existing = db.prepare('SELECT * FROM automation_flows WHERE id = ?').get(id) as any;
    if (!existing) {
      return NextResponse.json({ error: 'Flux non trouvé' }, { status: 404 });
    }

    if (existing.is_default === 1) {
      return NextResponse.json({ error: 'Les flux par défaut ne peuvent pas être modifiés' }, { status: 400 });
    }

    if (!name) {
      return NextResponse.json({ error: 'Le nom du flux est requis' }, { status: 400 });
    }

    if (!steps || !Array.isArray(steps) || steps.length === 0) {
      return NextResponse.json({ error: 'Au moins une étape est requise' }, { status: 400 });
    }

    // Validate steps structure
    for (const step of steps) {
      if (typeof step.template_id !== 'number' || typeof step.delay_days !== 'number') {
        return NextResponse.json({ error: 'Format d\'étape invalide' }, { status: 400 });
      }
    }

    db.prepare(`
      UPDATE automation_flows 
      SET name = ?, description = ?, steps = ?
      WHERE id = ?
    `).run(name, description || '', JSON.stringify(steps), id);

    const flow = db.prepare('SELECT * FROM automation_flows WHERE id = ?').get(id) as any;
    if (flow) {
      flow.steps = JSON.parse(flow.steps);
      flow.is_default = !!flow.is_default;
    }

    return NextResponse.json({ flow });
  } catch (error) {
    console.error('Error updating automation flow:', error);
    return NextResponse.json({ error: 'Failed to update automation flow' }, { status: 500 });
  }
}

// DELETE /api/automation-flows/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();

    const existing = db.prepare('SELECT * FROM automation_flows WHERE id = ?').get(id) as any;
    if (!existing) {
      return NextResponse.json({ error: 'Flux non trouvé' }, { status: 404 });
    }

    if (existing.is_default === 1) {
      return NextResponse.json({ error: 'Les flux par défaut ne peuvent pas être supprimés' }, { status: 400 });
    }

    // Find the default flow
    const defaultFlow = db.prepare('SELECT id FROM automation_flows WHERE is_default = 1 LIMIT 1').get() as { id: number } | undefined;
    const defaultFlowId = defaultFlow ? defaultFlow.id : null;

    // Move clients enrolled in this flow back to the default flow
    if (defaultFlowId) {
      db.prepare('UPDATE clients SET automation_flow_id = ?, current_flow_step_index = 0 WHERE automation_flow_id = ?')
        .run(defaultFlowId, id);
    } else {
      db.prepare('UPDATE clients SET automation_flow_id = NULL, current_flow_step_index = 0 WHERE automation_flow_id = ?')
        .run(id);
    }

    db.prepare('DELETE FROM automation_flows WHERE id = ?').run(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting automation flow:', error);
    return NextResponse.json({ error: 'Failed to delete automation flow' }, { status: 500 });
  }
}
