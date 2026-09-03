import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { getInvoiceById, getBillingSettings, Invoice } from './billing-db';
import { numberToWordsFr } from './number-to-words-fr';

// Helper to format dates in French (e.g. 2026-03-03 -> 3 Mars 2026)
function formatDateFr(dateStr: string): string {
  if (!dateStr) return '';
  const months = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
  ];
  const parts = dateStr.includes('-') ? dateStr.split('-') : dateStr.split('/');
  if (parts.length === 3) {
    let y = 0, m = 0, d = 0;
    if (parts[0].length === 4) {
      y = parseInt(parts[0], 10);
      m = parseInt(parts[1], 10) - 1;
      d = parseInt(parts[2], 10);
    } else {
      d = parseInt(parts[0], 10);
      m = parseInt(parts[1], 10) - 1;
      y = parseInt(parts[2], 10);
    }
    if (m >= 0 && m < 12 && d > 0 && y > 0) {
      return `${d === 1 ? '1er' : d} ${months[m]} ${y}`;
    }
  }
  return dateStr;
}

// Clean number format for Morocco/French (e.g. 58 000,00)
function formatNum(n: number): string {
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(n)
    .replace(/\u00a0/g, ' ')
    .replace(/\u202f/g, ' ');
}

// Format invoice number to match example: e.g. CMR-F0003-2026 -> 0003-2026 or 003-2026
function formatInvoiceNumber(invNum: string): string {
  const m = invNum.match(/[A-Za-z0-9]+-F?(\d+-\d{4})/);
  if (m) return m[1];
  return invNum;
}

// Format coupon invoice number: e.g. 0003-2026 -> 003-2026 or 0001-2026 -> 001-2026
function formatCouponInvoiceNumber(invNum: string): string {
  const clean = formatInvoiceNumber(invNum);
  const m = clean.match(/^0*(\d{2,3}-\d{4})$/);
  if (m) return m[1].length === 7 ? '0' + m[1] : m[1];
  return clean;
}

// Format words in Title Case for Moroccan accounting standards
function formatWordsTitleCase(words: string): string {
  return words
    .replace(/[-]/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export async function generateInvoicePdf(invoiceId: number, outputPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const invoice = getInvoiceById(invoiceId);
      if (!invoice) {
        throw new Error(`Invoice with ID ${invoiceId} not found`);
      }

      const settings = getBillingSettings();

      // Document Type & Titles
      const docType = invoice.document_type || settings.invoice_default_type || "Note d'honoraires";
      const isFacture = docType.toLowerCase().includes('facture');
      const docTitle = isFacture ? 'Facture' : "Note d'honoraires";

      // Display Toggles (invoice-level overrides settings-level)
      const showWatermark = invoice.show_watermark !== undefined 
        ? Boolean(invoice.show_watermark) 
        : (settings.pdf_show_watermark !== 'false');

      const watermarkOpacity = Number(settings.pdf_watermark_opacity || '0.045');

      const showCoupon = invoice.show_coupon !== undefined 
        ? Boolean(invoice.show_coupon) 
        : (settings.pdf_show_coupon !== 'false');

      const showBankDetails = invoice.show_bank_details !== undefined 
        ? Boolean(invoice.show_bank_details) 
        : (settings.pdf_show_bank !== 'false');

      const showDebours = invoice.show_debours !== undefined 
        ? Boolean(invoice.show_debours) 
        : (invoice.disbursements > 0 || settings.pdf_show_debours !== 'false');

      // Contact Person for FPA
      const contactPerson = invoice.contact_name || settings.company_manager || 'Siham OUSAID';

      // Font file paths
      const fontTimesRegular = path.join(process.cwd(), 'public', 'fonts', 'Times-Regular.ttf');
      const fontTimesBold = path.join(process.cwd(), 'public', 'fonts', 'Times-Bold.ttf');
      const fontTimesItalic = path.join(process.cwd(), 'public', 'fonts', 'Times-Italic.ttf');
      const fontTimesBoldItalic = path.join(process.cwd(), 'public', 'fonts', 'Times-BoldItalic.ttf');
      const fontArialRegular = path.join(process.cwd(), 'public', 'fonts', 'Arial.ttf');
      const fontArialBold = path.join(process.cwd(), 'public', 'fonts', 'Arial-Bold.ttf');

      // Create PDF Document (A4: 595.28 x 841.89 pt)
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 35, bottom: 40, left: 50, right: 50 },
        bufferPages: true,
        font: fontTimesRegular,
      });

      // Register fonts and aliases to avoid AFM loading issues
      doc.registerFont('Helvetica', fontTimesRegular);
      doc.registerFont('Helvetica-Bold', fontTimesBold);
      doc.registerFont('Helvetica-Oblique', fontTimesItalic);
      doc.registerFont('Helvetica-BoldOblique', fontTimesBoldItalic);

      doc.registerFont('Times-Roman', fontTimesRegular);
      doc.registerFont('Times-Bold', fontTimesBold);
      doc.registerFont('Times-Italic', fontTimesItalic);
      doc.registerFont('Times-BoldItalic', fontTimesBoldItalic);
      doc.registerFont('Arial', fontArialRegular);
      doc.registerFont('Arial-Bold', fontArialBold);

      doc.font('Times-Roman');

      const writeStream = fs.createWriteStream(outputPath);
      doc.pipe(writeStream);

      // --- WATERMARK ---
      const drawWatermark = () => {
        if (!showWatermark) return;
        const monogramPath = path.join(process.cwd(), 'public', 'logo-monogram.png');
        if (fs.existsSync(monogramPath)) {
          doc.save();
          doc.opacity(watermarkOpacity);
          doc.image(monogramPath, (595.28 - 300) / 2, 260, { width: 300 });
          doc.restore();
        }
      };

      // --- PAGE HEADER ---
      const drawPageHeader = (pageNum: number) => {
        if (pageNum === 1) {
          // Centered Header Logo
          const logoPath = path.join(process.cwd(), 'public', settings.company_logo_path || 'logo.png');
          if (fs.existsSync(logoPath)) {
            const logoW = 158;
            const logoX = (595.28 - logoW) / 2;
            doc.image(logoPath, logoX, 36, { width: logoW });
          }

          // Centered Invoice Title
          const invNum = formatInvoiceNumber(invoice.invoice_number);
          doc.fillColor('#111827')
             .font('Times-Bold')
             .fontSize(12.5)
             .text(`${docTitle} n° ${invNum}`, 50, 98, { align: 'center', width: 495.28 });
        } else {
          // Continuation Header for multi-page
          const invNum = formatInvoiceNumber(invoice.invoice_number);
          doc.fillColor('#6B7280')
             .font('Times-Roman')
             .fontSize(8.5)
             .text(`${docTitle} n° ${invNum} (suite) - Page ${pageNum}`, 50, 30, { align: 'right', width: 495.28 });
          doc.moveTo(50, 42).lineTo(545.28, 42).strokeColor('#E5E7EB').lineWidth(0.5).stroke();
        }
      };

      // --- PAGE FOOTER ---
      const drawPageFooter = (pageNum: number, total: number) => {
        const footerY = 752;

        // Bottom left logo monogram
        const monogramPath = path.join(process.cwd(), 'public', 'logo-monogram.png');
        if (fs.existsSync(monogramPath)) {
          doc.image(monogramPath, 50, footerY - 2, { width: 44 });
        }

        // Middle block: Company Name, Address, Tel, Website
        const goldColor = '#C5A03D';
        const darkGrey = '#374151';
        const lightGrey = '#6B7280';

        const midX = 108;
        const lineSpacing = 9;

        doc.font('Arial-Bold').fontSize(7.5).fillColor(darkGrey)
           .text(settings.company_name || 'Finance Pro Advisory S.A.R.L AU', midX, footerY);

        doc.font('Arial').fontSize(6.8);
        doc.fillColor(goldColor).text('Adresse : ', midX, footerY + lineSpacing * 1.15, { continued: true })
           .fillColor(lightGrey).text(settings.company_address ? settings.company_address.split(',')[0] : 'Espace Paquet, Angle rue Mohammed Smiha');

        const addrPart2 = settings.company_address && settings.company_address.includes(',')
          ? settings.company_address.substring(settings.company_address.indexOf(',') + 1).trim()
          : 'et Pierre Parent, N° 423, 4ème étage - Casablanca';
        doc.fillColor(lightGrey).text(addrPart2, midX + 38, footerY + lineSpacing * 2.15);

        doc.fillColor(goldColor).text('Tél : ', midX, footerY + lineSpacing * 3.15, { continued: true })
           .fillColor(lightGrey).text(settings.company_phone || '+212 522 905 893');

        doc.fillColor(goldColor).text('Site web : ', midX, footerY + lineSpacing * 4.15, { continued: true })
           .fillColor(lightGrey).text(settings.company_website || 'www.financeproadvisory.com');

        // Right block: RC, TP, IF, CNSS, ICE (5 lines, aligned with middle)
        const rightX = 425;
        const rc = settings.company_rc || '360.159';
        const tp = settings.company_tp || '32182569';
        const if_num = settings.company_if || '20681166';
        const cnss = settings.company_cnss || '5182332';
        const ice = settings.company_ice || '001769356000082';

        doc.font('Arial').fontSize(6.8);
        doc.fillColor(goldColor).text('RC: ', rightX, footerY, { continued: true })
           .fillColor(lightGrey).text(rc);

        doc.fillColor(goldColor).text('TP: ', rightX, footerY + lineSpacing * 1.15, { continued: true })
           .fillColor(lightGrey).text(tp);

        doc.fillColor(lightGrey).text(`IF: ${if_num}`, rightX, footerY + lineSpacing * 2.15);
        doc.fillColor(lightGrey).text(`CNSS: ${cnss}`, rightX, footerY + lineSpacing * 3.15);
        doc.fillColor(lightGrey).text(`ICE: ${ice}`, rightX, footerY + lineSpacing * 4.15);

        // Multi-page counter (only if total > 1)
        if (total > 1) {
          doc.fillColor(lightGrey).font('Arial').fontSize(7)
             .text(`Page ${pageNum} / ${total}`, 50, footerY + lineSpacing * 4.5, { align: 'center', width: 495.28 });
        }
      };

      // ==========================================
      // PAGE 1 CONTENT LAYOUT
      // ==========================================

      // 1. Client Information Block (Left Column)
      const clientStartY = 138;
      let leftY = clientStartY;

      // Client Name (Uppercase, Bold)
      doc.fillColor('#111827')
         .font('Times-Bold')
         .fontSize(9.5)
         .text((invoice.client_name || '').toUpperCase(), 50, leftY, { width: 240 });
      leftY = doc.y + 2;

      // Attention line
      let attentionPerson = '';
      if (invoice.salutation && !invoice.salutation.startsWith('Cher') && !invoice.salutation.startsWith('Chère')) {
        attentionPerson = invoice.salutation;
      } else if (invoice.client_contact_person) {
        const civ = invoice.client_contact_civility === 'Mme' ? 'Madame' :
                    invoice.client_contact_civility === 'M.' ? 'Monsieur' :
                    (invoice.client_contact_civility || '');
        attentionPerson = `${civ} ${invoice.client_contact_person}`.trim();
      }

      if (attentionPerson) {
        const prefix = attentionPerson.toLowerCase().startsWith('a l\'attention') ? '' : "A l'Attention de ";
        doc.font('Times-Roman').fontSize(9).text(`${prefix}${attentionPerson}`, 50, leftY, { width: 240 });
        leftY = doc.y + 2;
      }

      // Address lines
      if (invoice.client_address) {
        doc.font('Times-Roman').fontSize(9).text(invoice.client_address, 50, leftY, { width: 240 });
        leftY = doc.y + 2;
      }

      // Spacing before ICE
      leftY += 12;

      // Client ICE
      if (invoice.client_ice) {
        doc.font('Times-Roman').fontSize(9).text(`ICE: ${invoice.client_ice}`, 50, leftY, { width: 240 });
        leftY = doc.y + 2;
      }

      // 2. References Block (Right Column)
      const rightStartY = Math.max(leftY - 24, 182);
      doc.fillColor('#111827');

      // Réf.
      doc.font('Times-Bold').fontSize(9).text('Réf.', 310, rightStartY);
      doc.font('Times-Roman').fontSize(9).text(`: ${invoice.reference_text || 'N/A'}`, 375, rightStartY, { width: 170 });
      const refBottomY = doc.y + 3;

      // Votre Contact
      doc.font('Times-Bold').fontSize(9).text('Votre Contact', 310, refBottomY);
      doc.font('Times-Roman').fontSize(9).text(`: ${contactPerson}`, 375, refBottomY, { width: 170 });
      const contactBottomY = doc.y + 14;

      // Date: Le 3 Mars 2026
      const dateFr = formatDateFr(invoice.invoice_date);
      doc.font('Times-Roman').fontSize(9).text(`Le ${dateFr}`, 375, contactBottomY);

      // 3. Salutation & Introductory Note
      const salutationY = Math.max(leftY + 14, contactBottomY + 24, 245);

      const isMadame = (invoice.client_contact_civility === 'Mme') ||
                       (invoice.salutation && invoice.salutation.includes('Madame'));
      const greeting = isMadame ? 'Chère cliente,' : 'Cher client,';

      doc.font('Times-Roman').fontSize(9).fillColor('#111827')
         .text(greeting, 50, salutationY);

      let salutationIntro = settings.invoice_salutation || "Nous vous souhaitons bonne réception de notre note d'honoraires et vous remercions de votre aimable règlement";
      salutationIntro = salutationIntro.replace(/^(Cher client,|Chère cliente,)\s*/i, '');
      if (isFacture && salutationIntro.includes("notre note d'honoraires")) {
        salutationIntro = salutationIntro.replace("notre note d'honoraires", "notre facture");
      }
      doc.font('Times-Roman').fontSize(9).fillColor('#111827')
         .text(salutationIntro, 50, salutationY + 14, { width: 495.28 });

      // 4. Section Title (Centered)
      const sectionTitleY = salutationY + 38;
      doc.font('Times-Bold').fontSize(10.5).fillColor('#111827')
         .text(docTitle, 50, sectionTitleY, { align: 'center', width: 495.28 });

      // 5. Items / Prestations (Clean, borderless typography)
      let currentY = sectionTitleY + 24;

      (invoice.items || []).forEach((item) => {
        // Measure heights
        doc.font('Times-Bold').fontSize(9);
        const descHeight = doc.heightOfString(item.description, { width: 370 });

        doc.font('Times-Roman').fontSize(8.5);
        const detailHeight = item.detail ? doc.heightOfString(item.detail, { width: 370 }) : 0;
        const totalItemHeight = descHeight + detailHeight + 12;

        // Check if page overflow
        if (currentY + totalItemHeight > 680) {
          doc.addPage();
          currentY = 60;
        }

        // Render Description
        doc.font('Times-Bold').fontSize(9).fillColor('#111827')
           .text(item.description, 50, currentY, { width: 370 });

        // Render Price on the right
        const formattedPrice = formatNum(item.total_ht);
        doc.font('Times-Roman').fontSize(9).fillColor('#111827')
           .text(formattedPrice, 430, currentY, { align: 'right', width: 68 });
        doc.font('Times-Roman').fontSize(9).fillColor('#111827')
           .text('MAD', 506, currentY);

        // Render Sub-detail
        if (item.detail) {
          doc.font('Times-Roman').fontSize(8.5).fillColor('#374151')
             .text(item.detail, 50, currentY + descHeight + 3, { width: 370 });
        }

        currentY += totalItemHeight;
      });

      // Render Service Completion Date Text if present
      if (invoice.service_date_text) {
        doc.font('Times-Roman').fontSize(8.5).fillColor('#374151')
           .text(invoice.service_date_text, 50, currentY, { width: 370 });
        currentY += 14;
      }

      // 6. Totals Block (Right aligned, clean typography matching real invoices)
      if (currentY + 140 > 720) {
        doc.addPage();
        currentY = 60;
      } else {
        currentY = Math.max(currentY + 6, 365);
      }

      const totalsLabelX = 350;
      const totalsAmountX = 430;
      const totalsMadX = 506;
      const rowGap = 14;

      // Sous total HT
      doc.font('Times-Bold').fontSize(9).fillColor('#111827')
         .text('Sous total HT', totalsLabelX, currentY);
      doc.font('Times-Bold').fontSize(9).fillColor('#111827')
         .text(formatNum(invoice.subtotal_ht), totalsAmountX, currentY, { align: 'right', width: 68 });
      doc.font('Times-Roman').fontSize(9).fillColor('#111827')
         .text('MAD', totalsMadX, currentY);

      // TVA
      currentY += rowGap;
      doc.font('Times-Bold').fontSize(9).fillColor('#111827')
         .text(`TVA (${invoice.tva_rate}%)`, totalsLabelX, currentY);
      doc.font('Times-Bold').fontSize(9).fillColor('#111827')
         .text(formatNum(invoice.tva_amount), totalsAmountX, currentY, { align: 'right', width: 68 });
      doc.font('Times-Roman').fontSize(9).fillColor('#111827')
         .text('MAD', totalsMadX, currentY);

      // Débours (Optional toggle)
      if (showDebours) {
        currentY += rowGap;
        doc.font('Times-Bold').fontSize(9).fillColor('#111827')
           .text('Débours', totalsLabelX, currentY);
        const deboursText = invoice.disbursements > 0 ? formatNum(invoice.disbursements) : '-';
        doc.font('Times-Bold').fontSize(9).fillColor('#111827')
           .text(deboursText, totalsAmountX, currentY, { align: 'right', width: 68 });
        doc.font('Times-Roman').fontSize(9).fillColor('#111827')
           .text('MAD', totalsMadX, currentY);
      }

      // Total TTC
      currentY += rowGap;
      doc.font('Times-Bold').fontSize(9.5).fillColor('#111827')
         .text('Total TTC', totalsLabelX, currentY);
      doc.font('Times-Bold').fontSize(9.5).fillColor('#111827')
         .text(formatNum(invoice.total_ttc), totalsAmountX, currentY, { align: 'right', width: 68 });
      doc.font('Times-Bold').fontSize(9.5).fillColor('#111827')
         .text('MAD', totalsMadX, currentY);

      // 7. Arrêtée la Présente Note d'honoraires... (Underlined, matching real invoice)
      currentY = Math.max(currentY + 24, 442);
      let rawWords = invoice.amount_in_words;
      if (!rawWords || rawWords.trim() === '') {
        rawWords = numberToWordsFr(invoice.total_ttc) + ' Dirhams';
      }
      if (!rawWords.toLowerCase().includes('dirham') && !rawWords.toLowerCase().includes('mad')) {
        rawWords = rawWords.trim() + ' Dirhams';
      }
      const wordsFormatted = formatWordsTitleCase(rawWords);

      // Closing Prefix
      let arreteePrefix = invoice.closing_text;
      if (!arreteePrefix || arreteePrefix.trim() === '') {
        arreteePrefix = isFacture 
          ? (settings.invoice_closing_facture || 'Arrêté la présente facture à la somme de')
          : (settings.invoice_closing || 'Arrêtée la Présente Note d\'honoraires à la somme de');
      }

      const arreteeText = `${arreteePrefix} ${wordsFormatted}.`;
      doc.font('Times-Bold').fontSize(8.8).fillColor('#111827')
         .text(arreteeText, 50, currentY, { underline: true, align: 'center', width: 495.28 });

      // 8. Bank References & Legal Notes (Two columns)
      currentY = Math.max(currentY + 22, 472);

      // Left column: Bank References (Optional toggle)
      if (showBankDetails) {
        doc.font('Times-Bold').fontSize(8).fillColor('#111827')
           .text('Nos références bancaires:', 50, currentY, { underline: true });

        const bankName = settings.bank_name || 'CFG BANK';
        const bankRib = settings.bank_rib || '050 780 001 01 078302 420 01 39';
        const bankBranch = settings.bank_branch || 'Bd. Massira AL Khadra\nMaarif - Casablanca - Maroc';
        const bankOrderOf = settings.bank_order_of || settings.company_name || 'Finance Pro Advisory';

        doc.font('Times-Roman').fontSize(7.5).fillColor('#374151')
           .text(`Paiement par virement bancaire à l'ordre de ${bankOrderOf}`, 50, currentY + 11)
           .text(bankName, 50, currentY + 20)
           .text(bankBranch, 50, currentY + 29)
           .text(`CODE RIB: ${bankRib}`, 50, currentY + 46);
      }

      // Right column: Legal Notes
      const tvaNote = settings.tva_legal_note || 'TVA payée sur les encaissements déductible au moment du règlement.';
      const paymentNote = settings.payment_legal_note || 'Règlement à réception de facture.';

      doc.font('Times-Italic').fontSize(7.2).fillColor('#4B5563')
         .text(tvaNote, 310, currentY + 18, { align: 'right', width: 235 })
         .text(paymentNote, 310, currentY + 28, { align: 'right', width: 235 });

      // 9. Signer & Tear-off slip (A JOINDRE AU REGLEMENT)
      currentY = Math.max(currentY + 62, 552);

      // Left: Signer
      const managerName = settings.company_manager || 'Siham OUSAID';
      const managerTitle = settings.company_manager_title || 'Associée Gérante';
      doc.font('Times-Bold').fontSize(9.5).fillColor('#111827')
         .text(managerName, 50, currentY);
      doc.font('Times-Roman').fontSize(8).fillColor('#374151')
         .text(managerTitle, 50, currentY + 12);

      // Right: Tear-off Coupon Box (Optional toggle)
      if (showCoupon) {
        const boxX = 230;
        const boxY = currentY - 5;
        const boxW = 315;
        const boxH = 46;
        const couponTitle = settings.coupon_title || 'A JOINDRE AU REGLEMENT';

        // Draw box border
        doc.rect(boxX, boxY, boxW, boxH).strokeColor('#111827').lineWidth(0.8).stroke();

        // Top row: A JOINDRE AU REGLEMENT
        doc.font('Times-Bold').fontSize(8).fillColor('#111827')
           .text(couponTitle, boxX, boxY + 4, { align: 'center', width: boxW });

        // Horizontal separator line under header
        doc.moveTo(boxX, boxY + 16).lineTo(boxX + boxW, boxY + 16).strokeColor('#111827').lineWidth(0.6).stroke();

        // Vertical separators for 3 columns: Facture (32%), Client (30%), Montant (38%)
        const col1W = 100;
        const col2W = 95;
        const col3W = 120;

        const v1X = boxX + col1W;
        const v2X = v1X + col2W;

        doc.moveTo(v1X, boxY + 16).lineTo(v1X, boxY + boxH).strokeColor('#111827').lineWidth(0.6).stroke();
        doc.moveTo(v2X, boxY + 16).lineTo(v2X, boxY + boxH).strokeColor('#111827').lineWidth(0.6).stroke();

        // Column Headers
        doc.font('Times-Bold').fontSize(7.5).fillColor('#111827')
           .text('Facture', boxX, boxY + 19, { align: 'center', width: col1W })
           .text('Client', v1X, boxY + 19, { align: 'center', width: col2W })
           .text('Montant', v2X, boxY + 19, { align: 'center', width: col3W });

        // Column Values
        const couponInvNum = formatCouponInvoiceNumber(invoice.invoice_number);
        const couponClientAbbr = invoice.client_abbreviation || (invoice.client_name || '').substring(0, 5).toUpperCase();
        const couponAmount = `${formatNum(invoice.total_ttc)}   MAD`;

        doc.font('Times-Roman').fontSize(8).fillColor('#111827')
           .text(couponInvNum, boxX, boxY + 31, { align: 'center', width: col1W })
           .text(couponClientAbbr, v1X, boxY + 31, { align: 'center', width: col2W })
           .text(couponAmount, v2X, boxY + 31, { align: 'center', width: col3W });
      }

      // ==========================================
      // APPLY WATERMARK, HEADERS & FOOTERS
      // ==========================================
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        drawWatermark();
        drawPageHeader(i + 1);
        drawPageFooter(i + 1, pages.count);
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
