import { NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { getInvoiceById, updateInvoiceStatus, logBillingActivity } from '@/lib/billing-db';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const invoiceId = Number(id);
    const invoice = getInvoiceById(invoiceId);
    
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }
    
    return NextResponse.json({ invoice });
  } catch (error) {
    console.error('Get invoice error:', error);
    return NextResponse.json({ error: 'Failed to retrieve invoice details' }, { status: 500 });
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const invoiceId = Number(id);
    const body = await request.json();
    
    const db = getDb();
    
    // Check if invoice exists
    const invoice = getInvoiceById(invoiceId);
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    if (body.status) {
      updateInvoiceStatus(invoiceId, body.status);
    } else {
      // General update fields
      const fields: string[] = [];
      const values: any[] = [];
      
      Object.entries(body).forEach(([key, val]) => {
        if (key !== 'id' && key !== 'items' && key !== 'created_at' && key !== 'updated_at') {
          fields.push(`${key} = ?`);
          values.push(val);
        }
      });
      
      if (fields.length > 0) {
        fields.push("updated_at = datetime('now')");
        values.push(invoiceId);
        db.prepare(`UPDATE invoices SET ${fields.join(', ')} WHERE id = ?`).run(...values);
        logBillingActivity('invoice_updated', invoiceId, undefined, 'Facture mise à jour');
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update invoice error:', error);
    return NextResponse.json({ error: 'Failed to update invoice' }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const invoiceId = Number(id);
    
    const db = getDb();
    const invoice = getInvoiceById(invoiceId);
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }
    
    db.prepare('DELETE FROM invoices WHERE id = ?').run(invoiceId);
    logBillingActivity('invoice_deleted', undefined, invoice.client_id, `Facture ${invoice.invoice_number} supprimée`);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete invoice error:', error);
    return NextResponse.json({ error: 'Failed to delete invoice' }, { status: 500 });
  }
}
