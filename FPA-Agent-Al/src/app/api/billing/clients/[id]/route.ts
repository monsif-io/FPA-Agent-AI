import { NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { getBillingClientById, updateBillingClient } from '@/lib/billing-db';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const clientId = Number(id);
    const client = getBillingClientById(clientId);
    
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }
    
    return NextResponse.json({ client });
  } catch (error) {
    console.error('Get billing client error:', error);
    return NextResponse.json({ error: 'Failed to retrieve client details' }, { status: 500 });
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const clientId = Number(id);
    const body = await request.json();
    
    const client = getBillingClientById(clientId);
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    updateBillingClient(clientId, body);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update billing client error:', error);
    return NextResponse.json({ error: 'Failed to update client' }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const clientId = Number(id);
    
    const db = getDb();
    const client = getBillingClientById(clientId);
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }
    
    // Soft delete or hard delete. Since billing clients has cascade or active flag, let's hard delete
    db.prepare('DELETE FROM billing_clients WHERE id = ?').run(clientId);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete billing client error:', error);
    return NextResponse.json({ error: 'Failed to delete client' }, { status: 500 });
  }
}
