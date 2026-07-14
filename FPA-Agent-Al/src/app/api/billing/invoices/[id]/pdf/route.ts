import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getInvoiceById, updateInvoiceStatus } from '@/lib/billing-db';
import { generateInvoicePdf } from '@/lib/invoice-pdf';
import getDb from '@/lib/db';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/billing/invoices/[id]/pdf — Generate PDF and save on disk
export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const invoiceId = Number(id);
    const invoice = getInvoiceById(invoiceId);
    
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Ensure output directory exists
    const outputDir = path.join(process.cwd(), 'public', 'invoices');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Clean invoice number for filename
    const filename = `${invoice.invoice_number.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`;
    const outputPath = path.join(outputDir, filename);

    // Generate PDF
    await generateInvoicePdf(invoiceId, outputPath);

    // Save path in DB
    const relativePath = `/invoices/${filename}`;
    const db = getDb();
    db.prepare(`
      UPDATE invoices 
      SET pdf_path = ?, pdf_generated_at = datetime('now') 
      WHERE id = ?
    `).run(relativePath, invoiceId);

    return NextResponse.json({ success: true, pdfPath: relativePath });
  } catch (error: any) {
    console.error('PDF generation API error:', error);
    return NextResponse.json({ error: 'Failed to generate PDF invoice', details: error.message }, { status: 500 });
  }
}

// GET /api/billing/invoices/[id]/pdf — Download or view generated PDF
export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const invoiceId = Number(id);
    const invoice = getInvoiceById(invoiceId);
    
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    let pdfPath = invoice.pdf_path;
    let absolutePath = pdfPath ? path.join(process.cwd(), 'public', pdfPath) : '';

    // If PDF doesn't exist, generate it on-the-fly
    if (!pdfPath || !fs.existsSync(absolutePath)) {
      const outputDir = path.join(process.cwd(), 'public', 'invoices');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const filename = `${invoice.invoice_number.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`;
      const outputPath = path.join(outputDir, filename);

      await generateInvoicePdf(invoiceId, outputPath);
      
      pdfPath = `/invoices/${filename}`;
      const db = getDb();
      db.prepare(`
        UPDATE invoices 
        SET pdf_path = ?, pdf_generated_at = datetime('now') 
        WHERE id = ?
      `).run(pdfPath, invoiceId);
      
      absolutePath = outputPath;
    }

    const fileBuffer = fs.readFileSync(absolutePath);

    // Stream PDF response
    return new Response(fileBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${invoice.invoice_number}.pdf"`,
      },
    });
  } catch (error) {
    console.error('PDF fetch API error:', error);
    return NextResponse.json({ error: 'Failed to read PDF file' }, { status: 500 });
  }
}
