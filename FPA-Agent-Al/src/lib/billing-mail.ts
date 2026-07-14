import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import getDb from './db';
import { getBillingSettings } from './billing-db';

interface SendBillingMailParams {
  to: string;
  subject: string;
  html: string;
  pdfPath: string; // Absolute path to PDF file
  pdfFilename: string;
}

export async function sendBillingMail({ to, subject, html, pdfPath, pdfFilename }: SendBillingMailParams): Promise<{ success: boolean; error?: string }> {
  try {
    const db = getDb();
    const getSetting = (key: string): string => {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
      return row?.value || '';
    };

    const billingSettings = getBillingSettings();
    const sendMethod = getSetting('email_send_method') || 'brevo';

    // Verify PDF file exists
    if (!fs.existsSync(pdfPath)) {
      return { success: false, error: `PDF file not found at ${pdfPath}` };
    }

    if (sendMethod === 'brevo') {
      const brevoApiKey = process.env.BREVO_API_KEY || getSetting('brevo_api_key');
      if (!brevoApiKey) {
        return { success: false, error: 'Brevo API key is not configured.' };
      }
      
      const senderEmail = billingSettings.company_email || process.env.BREVO_SENDER_EMAIL || getSetting('brevo_sender_email') || 'contact@alfa-01.com';
      const senderName = billingSettings.company_name || process.env.BREVO_SENDER_NAME || getSetting('brevo_sender_name') || 'Finance Pro Advisory';

      console.log(`[BILLING-MAIL] Sending billing email to ${to} via Brevo with attachment`);

      const pdfBase64 = fs.readFileSync(pdfPath).toString('base64');

      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': brevoApiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sender: {
            name: senderName,
            email: senderEmail,
          },
          to: [
            {
              email: to,
            },
          ],
          subject: subject,
          htmlContent: html,
          attachment: [
            {
              content: pdfBase64,
              name: pdfFilename,
            }
          ]
        }),
      });

      const data = await response.json();

      if (response.ok && (data.messageId || data.id)) {
        return { success: true };
      } else {
        console.error('[BILLING-MAIL] Brevo error:', data);
        return { success: false, error: data.message || JSON.stringify(data) };
      }
    } else {
      // SMTP
      const smtpHost = getSetting('smtp_host');
      const smtpPort = parseInt(getSetting('smtp_port') || '587');
      const smtpUser = getSetting('smtp_user');
      const smtpPass = getSetting('smtp_pass');
      const smtpFrom = getSetting('smtp_from') || 'sarah@alfa-01.com';

      if (!smtpHost || !smtpUser || !smtpPass) {
        return { success: false, error: 'SMTP settings are incomplete.' };
      }

      console.log(`[BILLING-MAIL] Sending billing email to ${to} via SMTP with attachment`);

      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPass },
        tls: { rejectUnauthorized: false },
        connectionTimeout: 10000,
      });

      const fromName = billingSettings.company_name || 'Finance Pro Advisory';
      const fromHeader = `"${fromName}" <${smtpFrom}>`;

      await transporter.sendMail({
        from: fromHeader,
        to,
        subject,
        html,
        attachments: [
          {
            filename: pdfFilename,
            path: pdfPath,
          }
        ]
      });

      return { success: true };
    }
  } catch (error) {
    console.error('[BILLING-MAIL] Error sending billing mail:', error);
    return { success: false, error: String(error) };
  }
}
