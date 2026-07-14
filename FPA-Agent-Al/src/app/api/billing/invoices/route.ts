import { NextResponse } from 'next/server';
import { getInvoices, createInvoice, getNextInvoiceNumber, getBillingClientById } from '@/lib/billing-db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || undefined;
    const invoices = getInvoices(status);
    return NextResponse.json({ invoices });
  } catch (error) {
    console.error('Fetch invoices error:', error);
    return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      client_id, invoice_date, due_date, reference_text, salutation,
      subtotal_ht, tva_rate, tva_amount, disbursements, total_ttc,
      amount_in_words, payment_terms, items
    } = body;

    if (!client_id || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Client ID and items list are required' }, { status: 400 });
    }

    // 1. Get client to find abbreviation
    const client = getBillingClientById(client_id);
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    // 2. Generate unique smart number
    const abbreviation = client.abbreviation || 'FPA';
    const { number } = getNextInvoiceNumber(abbreviation);

    // 3. Save to database
    const invoiceId = createInvoice(
      {
        invoice_number: number,
        invoice_date,
        due_date,
        client_id,
        reference_text,
        salutation,
        subtotal_ht,
        tva_rate,
        tva_amount,
        disbursements,
        total_ttc,
        amount_in_words,
        payment_terms,
        status: 'draft',
        source_type: 'manual',
        pdf_path: ''
      },
      items
    );

    return NextResponse.json({ success: true, invoiceId, invoiceNumber: number }, { status: 201 });
  } catch (error) {
    console.error('Create invoice error:', error);
    return NextResponse.json({ error: 'Failed to create invoice' }, { status: 500 });
  }
}
