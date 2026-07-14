import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { getInvoiceById, getBillingSettings } from './billing-db';
import { numberToWordsFr } from './number-to-words-fr';

export async function generateInvoicePdf(invoiceId: number, outputPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const invoice = getInvoiceById(invoiceId);
      if (!invoice) {
        throw new Error(`Invoice with ID ${invoiceId} not found`);
      }

      const settings = getBillingSettings();

      // Paths to custom fonts (resolves Next.js Turbopack AFM mapping issue)
      const fontRegular = path.join(process.cwd(), 'public', 'fonts', 'Arial.ttf');
      const fontBold = path.join(process.cwd(), 'public', 'fonts', 'Arial-Bold.ttf');
      const fontItalic = path.join(process.cwd(), 'public', 'fonts', 'Arial-Italic.ttf');
      const fontBoldItalic = path.join(process.cwd(), 'public', 'fonts', 'Arial-BoldItalic.ttf');

      // Create PDF using custom font as default to bypass default Helvetica AFM loading
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 60, left: 50, right: 50 },
        bufferPages: true,
        font: fontRegular,
      });

      doc.registerFont('Helvetica', fontRegular);
      doc.registerFont('Helvetica-Bold', fontBold);
      doc.registerFont('Helvetica-Oblique', fontItalic);
      doc.registerFont('Helvetica-BoldOblique', fontBoldItalic);

      const writeStream = fs.createWriteStream(outputPath);
      doc.pipe(writeStream);

      // Colors
      const gold = '#C5A03D';
      const anthracite = '#3A3A3A';
      const grayLight = '#F3F4F6';
      const grayDark = '#6B7280';
      const lineGray = '#E5E7EB';

      // --- PAGE HEADER & FOOTER SETUP ---
      const totalPages = () => doc.bufferedPageRange().count;

      const drawHeader = (pageNum: number) => {
        // Logo / Title
        const logoPath = path.join(process.cwd(), 'public', settings.company_logo_path || 'logo.png');
        if (fs.existsSync(logoPath)) {
          doc.image(logoPath, 50, 40, { width: 140 });
        } else {
          doc.fillColor(gold)
             .font('Helvetica-Bold')
             .fontSize(20)
             .text('FinancePro Advisory', 50, 45);
        }

        doc.fillColor(anthracite)
           .font('Helvetica')
           .fontSize(9)
           .text('Note d\'honoraires', 350, 45, { align: 'right' })
           .font('Helvetica-Bold')
           .fontSize(12)
           .text(`n° ${invoice.invoice_number}`, 350, 58, { align: 'right' })
           .font('Helvetica')
           .fontSize(9)
           .text(`Le ${invoice.invoice_date}`, 350, 74, { align: 'right' });

        doc.moveTo(50, 95).lineTo(545, 95).strokeColor(gold).lineWidth(1).stroke();
      };

      const drawFooter = (pageNum: number, isLastPage: boolean) => {
        // Footer Line
        doc.moveTo(50, 770).lineTo(545, 770).strokeColor(lineGray).lineWidth(0.5).stroke();

        // Footer Text
        const name = settings.company_name || 'Finance Pro Advisory S.A.R.L. AU';
        const address = settings.company_address || 'Casablanca';
        const phone = settings.company_phone || '';
        const web = settings.company_website || '';
        const rc = settings.company_rc || '';
        const tp = settings.company_tp || '';
        const if_num = settings.company_if || '';
        const cnss = settings.company_cnss || '';
        const ice = settings.company_ice || '';

        doc.fillColor(grayDark)
           .font('Helvetica-Bold')
           .fontSize(8)
           .text(name, 50, 778, { align: 'center' })
           .font('Helvetica')
           .fontSize(7)
           .text(`Adresse : ${address}`, 50, 788, { align: 'center' })
           .text(`Tél : ${phone} | Site web : ${web}`, 50, 797, { align: 'center' })
           .text(`RC : ${rc} | TP : ${tp} | IF : ${if_num} | CNSS : ${cnss} | ICE : ${ice}`, 50, 806, { align: 'center' });

        // Page Number
        doc.fillColor(grayDark)
           .font('Helvetica')
           .fontSize(8)
           .text(`Page ${pageNum}/${totalPages()}`, 50, 750, { align: 'right' });
      };

      // --- INVOICE CONTENT ---

      // Page 1 setup
      drawHeader(1);

      // Client Box & Ref Box
      doc.y = 115;

      // Client info (Left Column)
      doc.fillColor(anthracite)
         .font('Helvetica-Bold')
         .fontSize(9)
         .text('CLIENT :', 50, 115)
         .font('Helvetica-Bold')
         .fontSize(10)
         .text(invoice.client_name || '', 50, 128, { width: 230 })
         .font('Helvetica')
         .fontSize(9);

      let clientY = 142;
      if (invoice.salutation && invoice.salutation !== 'Cher client') {
        doc.text(`À l'attention de ${invoice.salutation}`, 50, clientY, { width: 230 });
        clientY += 14;
      }
      if (invoice.client_address) {
        doc.text(invoice.client_address, 50, clientY, { width: 230 });
        clientY += 28;
      }
      if (invoice.client_ice) {
        doc.font('Helvetica-Bold').text(`ICE: ${invoice.client_ice}`, 50, clientY).font('Helvetica');
      }

      // References (Right Column)
      doc.fillColor(anthracite)
         .font('Helvetica-Bold')
         .fontSize(9)
         .text('Réf.', 320, 115)
         .font('Helvetica')
         .fontSize(9)
         .text(`: ${invoice.reference_text || 'N/A'}`, 380, 115, { width: 165 })
         .font('Helvetica-Bold')
         .text('Votre Contact', 320, 142)
         .font('Helvetica')
         .text(`: Siham OUSAID`, 380, 142)
         .font('Helvetica-Bold')
         .text('Echéance', 320, 156)
         .font('Helvetica')
         .text(`: ${invoice.due_date || 'A réception'}`, 380, 156);

      // Salutation sentence
      const salutationText = settings.invoice_salutation || 'Cher client, Nous vous souhaitons bonne réception de la présente note d\'honoraires...';
      doc.fillColor(anthracite)
         .font('Helvetica')
         .fontSize(9.5)
         .text(salutationText, 50, 210, { width: 495, align: 'justify', lineGap: 3 });

      // Table Title
      doc.fillColor(gold)
         .font('Helvetica-Bold')
         .fontSize(11)
         .text('Note d\'honoraires', 50, 255);

      // Table header
      let tableY = 275;
      doc.rect(50, tableY, 495, 20).fill(gold);
      doc.fillColor('#FFFFFF')
         .font('Helvetica-Bold')
         .fontSize(9)
         .text('Prestation / Description', 60, tableY + 6)
         .text('Montant HT (MAD)', 430, tableY + 6, { align: 'right', width: 100 });

      tableY += 20;

      const formatNum = (n: number) => {
        return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2 })
          .format(n)
          .replace(/\u00a0/g, ' ')
          .replace(/\u202f/g, ' ');
      };

      // Draw items
      doc.fillColor(anthracite);
      (invoice.items || []).forEach((item) => {
        // Calculate dynamic height
        const descHeight = doc.heightOfString(item.description, { width: 340 });
        const detailHeight = item.detail ? doc.heightOfString(item.detail, { width: 340 }) : 0;
        const rowHeight = Math.max(descHeight + detailHeight + 16, 35);

        // Check if page overflow
        if (tableY + rowHeight > 560) {
          doc.addPage();
          tableY = 110;
          drawHeader(totalPages());
          // Redraw header table
          doc.rect(50, tableY, 495, 20).fill(gold);
          doc.fillColor('#FFFFFF')
             .font('Helvetica-Bold')
             .fontSize(9)
             .text('Prestation / Description', 60, tableY + 6)
             .text('Montant HT (MAD)', 430, tableY + 6, { align: 'right', width: 100 });
          tableY += 20;
          doc.fillColor(anthracite);
        }

        // Draw Row lines
        doc.rect(50, tableY, 495, rowHeight).strokeColor(lineGray).lineWidth(0.5).stroke();

        // Write content
        doc.font('Helvetica-Bold')
           .fontSize(9)
           .text(item.description, 60, tableY + 8, { width: 340 });

        if (item.detail) {
          doc.font('Helvetica')
             .fontSize(8)
             .fillColor(grayDark)
             .text(item.detail, 60, tableY + descHeight + 10, { width: 340 })
             .fillColor(anthracite);
        }

        const formattedPrice = formatNum(item.total_ht);
        doc.font('Helvetica-Bold')
           .fontSize(9)
           .text(formattedPrice, 430, tableY + 8, { align: 'right', width: 100 });

        tableY += rowHeight;
      });

      // --- TOTALS BLOCK ---
      // Check if total block overflows page
      if (tableY + 180 > 560) {
        doc.addPage();
        tableY = 110;
        drawHeader(totalPages());
      }

      // Total HT
      doc.rect(340, tableY, 205, 80).strokeColor(lineGray).lineWidth(0.5).stroke();
      
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(grayDark);
      doc.text('Sous total HT', 350, tableY + 10);
      doc.text(`TVA (${invoice.tva_rate}%)`, 350, tableY + 26);
      if (invoice.disbursements > 0) {
        doc.text('Débours', 350, tableY + 42);
      }
      doc.fillColor(gold).text('Total TTC (MAD)', 350, tableY + 60);

      doc.fillColor(anthracite);
      doc.text(formatNum(invoice.subtotal_ht), 450, tableY + 10, { align: 'right', width: 85 });
      doc.text(formatNum(invoice.tva_amount), 450, tableY + 26, { align: 'right', width: 85 });
      if (invoice.disbursements > 0) {
        doc.text(formatNum(invoice.disbursements), 450, tableY + 42, { align: 'right', width: 85 });
      }
      doc.fillColor(gold).text(formatNum(invoice.total_ttc), 450, tableY + 60, { align: 'right', width: 85 });

      tableY += 95;

      // In words
      const words = invoice.amount_in_words || numberToWordsFr(invoice.total_ttc) + ' Dirhams';
      doc.fillColor(anthracite)
         .font('Helvetica')
         .fontSize(9)
         .text(`${settings.invoice_closing || 'Arrêtée la présente note d\'honoraires à la somme de'} : `, 50, tableY)
         .font('Helvetica-Bold')
         .text(`${words}.`, 50, tableY + 14, { width: 495 });

      tableY += 40;

      // Payment Details
      doc.fillColor(anthracite)
         .font('Helvetica-Bold')
         .fontSize(8.5)
         .text('Nos références bancaires :', 50, tableY)
         .font('Helvetica')
         .fontSize(8)
         .text(`Paiement par virement bancaire à l'ordre de ${settings.company_name || 'Finance Pro Advisory'}`, 50, tableY + 14)
         .text(`${settings.bank_name || 'CFG BANK'} | ${settings.bank_branch || ''}`, 50, tableY + 24)
         .text(`CODE RIB: ${settings.bank_rib || ''}`, 50, tableY + 34);

      // Legal Note (TVA & Payment Terms)
      const tvaLegal = settings.tva_legal_note || 'TVA payée sur les encaissements déductible au moment du règlement.';
      const paymentLegal = settings.payment_legal_note || 'Règlement à réception de facture.';
      doc.fillColor(grayDark)
         .font('Helvetica-Oblique')
         .fontSize(7.5)
         .text(tvaLegal, 300, tableY + 14, { width: 245, align: 'right' })
         .text(paymentLegal, 300, tableY + 26, { width: 245, align: 'right' });

      tableY += 60;

      // Signature Area
      doc.fillColor(anthracite)
         .font('Helvetica-Bold')
         .fontSize(9.5)
         .text(settings.company_manager || 'Siham OUSAID', 50, tableY)
         .font('Helvetica')
         .fontSize(8)
         .text(settings.company_manager_title || 'Associée Gérante', 50, tableY + 12);

      // --- PAYMENT STUB (À JOINDRE AU RÈGLEMENT) ---
      // Draw payment stub if it fits, else on next page (usually footer has margin, so let's check position)
      if (tableY + 100 > 720) {
        doc.addPage();
        tableY = 110;
        drawHeader(totalPages());
      } else {
        tableY = 665;
      }

      // Draw dotted line
      doc.strokeColor(grayDark).lineWidth(0.5).dash(3, { space: 3 }).moveTo(50, tableY).lineTo(545, tableY).stroke().undash();

      // Stub contents
      doc.fillColor(anthracite)
         .font('Helvetica-Bold')
         .fontSize(8)
         .text('A JOINDRE AU REGLEMENT', 50, tableY + 10, { align: 'center' });

      // Table inside stub
      const stubTableY = tableY + 24;
      doc.rect(120, stubTableY, 355, 30).strokeColor(lineGray).lineWidth(0.5).stroke();
      doc.moveTo(230, stubTableY).lineTo(230, stubTableY + 30).stroke();
      doc.moveTo(350, stubTableY).lineTo(350, stubTableY + 30).stroke();

      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(grayDark);
      doc.text('Note d\'honoraires', 125, stubTableY + 5);
      doc.text('Client', 235, stubTableY + 5);
      doc.text('Montant TTC', 355, stubTableY + 5);

      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(anthracite);
      doc.text(invoice.invoice_number, 125, stubTableY + 17);
      doc.text(invoice.client_abbreviation || '', 235, stubTableY + 17);
      doc.text(`${formatNum(invoice.total_ttc)} MAD`, 355, stubTableY + 17);

      // --- DRAW ALL PAGES HEADERS & FOOTERS ---
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        // Header
        drawHeader(i + 1);
        // Footer
        drawFooter(i + 1, i === pages.count - 1);
      }

      doc.end();

      writeStream.on('finish', () => {
        resolve(outputPath);
      });

      writeStream.on('error', (err) => {
        reject(err);
      });
    } catch (error) {
      reject(error);
    }
  });
}
