import { NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { getInvoiceById, logBillingActivity } from '@/lib/billing-db';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { invoiceId } = body;

    if (!invoiceId) {
      return NextResponse.json({ error: 'Invoice ID is required' }, { status: 400 });
    }

    const db = getDb();
    
    // 1. Get invoice details
    const invoice = getInvoiceById(Number(invoiceId));
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // 2. Check if client details are valid
    if (!invoice.client_name) {
      return NextResponse.json({ error: 'Client details are missing' }, { status: 400 });
    }

    // @ts-ignore
    const email = invoice.client_email || '';
    // @ts-ignore
    const phone = invoice.client_phone || '';
    // @ts-ignore
    const address = invoice.client_address || '';
    const name = invoice.client_name;
    const company = invoice.client_abbreviation || 'FPA Client';
    const amount = invoice.total_ttc;

    let collectionsClientId: number;

    // 3. Check if client already exists in Collections by email
    const existing = db.prepare('SELECT id, amount_due FROM clients WHERE email = ?').get(email) as { id: number; amount_due: number } | undefined;

    if (existing) {
      collectionsClientId = existing.id;
      const newDebt = existing.amount_due + amount;
      
      // Update amount due
      db.prepare(`
        UPDATE clients 
        SET amount_due = ?, status = 'pending', updated_at = datetime('now') 
        WHERE id = ?
      `).run(newDebt, collectionsClientId);
      
      console.log(`[BRIDGE] Updated existing client ID ${collectionsClientId} in Collections with new debt ${amount} MAD`);
    } else {
      // Create new client in Collections
      const res = db.prepare(`
        INSERT INTO clients (
          name, company, email, phone, amount_due, currency, status, escalation_level, is_active, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, 'MAD', 'pending', 'friendly', 1, ?, datetime('now'))
      `).run(
        name,
        company,
        email,
        phone,
        amount,
        `Transféré de Billing Agent (Facture ${invoice.invoice_number}). Adresse: ${address}`
      );
      
      collectionsClientId = Number(res.lastInsertRowid);
      console.log(`[BRIDGE] Created new client ID ${collectionsClientId} in Collections for ${name}`);
    }

    // 4. Update collections_client_id links
    db.prepare('UPDATE billing_clients SET collections_client_id = ? WHERE id = ?').run(collectionsClientId, invoice.client_id);
    db.prepare("UPDATE invoices SET status = 'overdue' WHERE id = ?").run(invoiceId); // update status to show active collection needed
    
    logBillingActivity('client_transferred_to_collections', invoiceId, invoice.client_id, `Client transféré vers Collections (ID ${collectionsClientId})`);

    return NextResponse.json({ success: true, collectionsClientId });
  } catch (error: any) {
    console.error('Transfer client bridge error:', error);
    return NextResponse.json({ error: 'Failed to bridge client to collections', details: error.message }, { status: 500 });
  }
}
