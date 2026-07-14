import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';

// GET /api/clients/[id]
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const client = db.prepare(`
      SELECT c.*, af.name as automation_flow_name, af.steps as automation_flow_steps
      FROM clients c
      LEFT JOIN automation_flows af ON c.automation_flow_id = af.id
      WHERE c.id = ?
    `).get(id) as any;

    if (!client) {
      return NextResponse.json({ error: 'Client non trouvé' }, { status: 404 });
    }

    if (client.automation_flow_steps) {
      try {
        client.automation_flow_steps = JSON.parse(client.automation_flow_steps);
      } catch (_) {
        client.automation_flow_steps = [];
      }
    }

    const schedule = db.prepare('SELECT * FROM schedules WHERE client_id = ?').get(id);
    const messages = db.prepare('SELECT * FROM message_logs WHERE client_id = ? ORDER BY sent_at DESC LIMIT 20').all(id);

    return NextResponse.json({ client, schedule, messages });
  } catch (error) {
    console.error('Error fetching client:', error);
    return NextResponse.json({ error: 'Failed to fetch client' }, { status: 500 });
  }
}

// PUT /api/clients/[id]
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const body = await req.json();

    const existing = db.prepare('SELECT * FROM clients WHERE id = ?').get(id) as any;
    if (!existing) {
      return NextResponse.json({ error: 'Client non trouvé' }, { status: 404 });
    }

    // Handle automation flow change
    if (body.automationFlowId !== undefined && body.automationFlowId !== existing.automation_flow_id) {
      body.currentFlowStepIndex = 0;
      body.flowStartedAt = new Date().toISOString();

      // Recalculate schedule next run
      const newFlowId = body.automationFlowId;
      let delayStr = '+1 day';
      if (newFlowId) {
        const flow = db.prepare('SELECT steps FROM automation_flows WHERE id = ?').get(newFlowId) as { steps: string } | undefined;
        if (flow) {
          try {
            const steps = JSON.parse(flow.steps || '[]');
            if (steps.length > 0 && steps[0].delay_days !== undefined) {
              delayStr = `+${steps[0].delay_days} days`;
            }
          } catch (_) {}
        }
      }
      db.prepare("UPDATE schedules SET next_run = datetime('now', ?), is_active = 1 WHERE client_id = ?")
        .run(delayStr, id);
    }

    const fields = [];
    const values: (string | number | null)[] = [];

    const allowedFields: Record<string, string> = {
      name: 'name', company: 'company', email: 'email', phone: 'phone',
      amountDue: 'amount_due', currency: 'currency', status: 'status',
      escalationLevel: 'escalation_level', dueDate: 'due_date',
      notes: 'notes', isActive: 'is_active', messagesSent: 'messages_sent',
      automationFlowId: 'automation_flow_id',
      currentFlowStepIndex: 'current_flow_step_index',
      flowStartedAt: 'flow_started_at'
    };

    for (const [key, col] of Object.entries(allowedFields)) {
      if (body[key] !== undefined) {
        fields.push(`${col} = ?`);
        values.push(body[key]);
      }
    }

    if (fields.length > 0) {
      fields.push('updated_at = datetime(\'now\')');
      values.push(parseInt(id));
      db.prepare(`UPDATE clients SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }

    // Update schedule if frequency provided
    if (body.frequency) {
      const existingSchedule = db.prepare('SELECT * FROM schedules WHERE client_id = ?').get(id);
      if (existingSchedule) {
        db.prepare('UPDATE schedules SET frequency = ?, is_active = ? WHERE client_id = ?')
          .run(body.frequency, body.isActive !== false ? 1 : 0, id);
      }
    }

    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
    return NextResponse.json({ client });
  } catch (error) {
    console.error('Error updating client:', error);
    return NextResponse.json({ error: 'Failed to update client' }, { status: 500 });
  }
}

// DELETE /api/clients/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    db.prepare('DELETE FROM schedules WHERE client_id = ?').run(id);
    db.prepare('DELETE FROM message_logs WHERE client_id = ?').run(id);
    db.prepare('DELETE FROM clients WHERE id = ?').run(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting client:', error);
    return NextResponse.json({ error: 'Failed to delete client' }, { status: 500 });
  }
}
