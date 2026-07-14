import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getInvoiceById, updateInvoiceStatus, getBillingSettings } from '@/lib/billing-db';
import { generateInvoicePdf } from '@/lib/invoice-pdf';
import { sendBillingMail } from '@/lib/billing-mail';
import getDb from '@/lib/db';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const invoiceId = Number(id);
    const invoice = getInvoiceById(invoiceId);
    
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Verify recipient email
    // @ts-ignore
    const recipientEmail = invoice.client_email;
    if (!recipientEmail) {
      return NextResponse.json({ error: 'Client email is not configured' }, { status: 400 });
    }

    // Ensure PDF is generated
    let pdfPath = invoice.pdf_path;
    let absolutePath = pdfPath ? path.join(process.cwd(), 'public', pdfPath) : '';

    if (!pdfPath || !fs.existsSync(absolutePath)) {
      const outputDir = path.join(process.cwd(), 'public', 'invoices');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const filename = `${invoice.invoice_number.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`;
      const outputPath = path.join(outputDir, filename);

      await generateInvoicePdf(invoiceId, outputPath);
      pdfPath = `/invoices/${filename}`;
      absolutePath = outputPath;
    }

    // Build Email body
    const settings = getBillingSettings();
    const companyName = settings.company_name || 'Finance Pro Advisory';
    
    const subject = `Note d'honoraires n° ${invoice.invoice_number} - ${companyName}`;
    const formattedAmount = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2 }).format(invoice.total_ttc);

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; color: #3A3A3A; max-width: 600px; margin: 0 auto; line-height: 1.6;">
        <div style="background-color: #3A3A3A; padding: 20px; text-align: center; border-bottom: 3px solid #C5A03D;">
          <h2 style="color: #C5A03D; margin: 0; font-family: Georgia, serif;">FinancePro Advisory</h2>
        </div>
        <div style="padding: 30px 20px; background-color: #FCFCFA;">
          <p>Bonjour,</p>
          <p>Nous vous adressons ci-joint notre note d'honoraires <strong>n° ${invoice.invoice_number}</strong> relative à nos prestations de conseil et d'accompagnement.</p>
          
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr style="background-color: #F9F9F7; border-bottom: 1px solid #E5E7EB;">
              <td style="padding: 10px; font-weight: bold; font-size: 14px;">Numéro de Facture</td>
              <td style="padding: 10px; text-align: right; font-size: 14px;">${invoice.invoice_number}</td>
            </tr>
            <tr style="border-bottom: 1px solid #E5E7EB;">
              <td style="padding: 10px; font-weight: bold; font-size: 14px;">Date d'émission</td>
              <td style="padding: 10px; text-align: right; font-size: 14px;">${invoice.invoice_date}</td>
            </tr>
            <tr style="background-color: #F9F9F7; border-bottom: 2px solid #C5A03D;">
              <td style="padding: 10px; font-weight: bold; font-size: 15px; color: #C5A03D;">Montant Total TTC</td>
              <td style="padding: 10px; text-align: right; font-weight: bold; font-size: 15px; color: #C5A03D;">${formattedAmount} MAD</td>
            </tr>
          </table>

          <p>Le règlement est à effectuer selon vos conditions habituelles par virement bancaire sur notre compte bancaire dont les coordonnées (RIB) figurent au bas du document PDF ci-joint.</p>
          <p>Nous vous remercions pour votre confiance et restons à votre entière disposition pour toute information complémentaire.</p>
          <br>
          <p style="margin: 0; font-weight: bold;">Siham OUSAID</p>
          <p style="margin: 0; color: #6B7280; font-size: 13px;">Associée Gérante | Finance Pro Advisory</p>
        </div>
        <div style="background-color: #F3F4F6; padding: 15px; text-align: center; font-size: 11px; color: #6B7280; border-top: 1px solid #E5E7EB;">
          ${companyName} | Tél: ${settings.company_phone || ''} | Site web: ${settings.company_website || ''}
        </div>
      </div>
    `;

    // Send Mail
    const filename = `${invoice.invoice_number}.pdf`;
    const mailResult = await sendBillingMail({
      to: recipientEmail,
      subject,
      html: emailHtml,
      pdfPath: absolutePath,
      pdfFilename: filename
    });

    if (mailResult.success) {
      updateInvoiceStatus(invoiceId, 'sent', 'email');
      
      // Update email destination field
      const db = getDb();
      db.prepare("UPDATE invoices SET sent_to_email = ? WHERE id = ?").run(recipientEmail, invoiceId);
      
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json({ error: mailResult.error || 'Failed to send email' }, { status: 500 });
    }
  } catch (error: any) {
    console.error('Email send API error:', error);
    return NextResponse.json({ error: 'Failed to send invoice email', details: error.message }, { status: 500 });
  }
}
