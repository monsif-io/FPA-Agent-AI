import nodemailer from 'nodemailer';
import getDb from './db';

interface SendMailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
  senderName?: string;
  replyTo?: string;
  headers?: Record<string, string>;
}

export async function sendMail({ to, subject, html, text, senderName, replyTo, headers }: SendMailParams): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const db = getDb();
    const getSetting = (key: string): string => {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
      return row?.value || '';
    };

    const sendMethod = getSetting('email_send_method') || 'brevo';

    if (sendMethod === 'brevo') {
      const brevoApiKey = process.env.BREVO_API_KEY || getSetting('brevo_api_key');
      if (!brevoApiKey) {
        return { success: false, error: 'Brevo API key is not configured. Please set it in the settings.' };
      }
      const senderEmail = process.env.BREVO_SENDER_EMAIL || getSetting('brevo_sender_email') || 'contact@alfa-01.com';
      const defaultSenderName = process.env.BREVO_SENDER_NAME || getSetting('brevo_sender_name') || 'Alfa-01';
      const actualSenderName = senderName || defaultSenderName;

      console.log(`[MAIL] Sending email to ${to} via Brevo HTTP API from ${actualSenderName} <${senderEmail}>`);

      // Parse replyTo email if it is in format: "Name <email@domain.com>"
      let replyToObj = undefined;
      if (replyTo) {
        const emailMatch = replyTo.match(/<([^>]+)>/) || [null, replyTo];
        const replyToEmail = emailMatch[1];
        if (replyToEmail) {
          replyToObj = { email: replyToEmail.trim() };
        }
      }

      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': brevoApiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sender: {
            name: actualSenderName,
            email: senderEmail,
          },
          to: [
            {
              email: to,
            },
          ],
          subject: subject,
          htmlContent: html,
          ...(text ? { textContent: text } : {}),
          ...(replyToObj ? { replyTo: replyToObj } : {}),
          ...(headers ? { headers } : {}),
        }),
      });

      const data = await response.json();

      if (response.ok && (data.messageId || data.id)) {
        const msgId = data.messageId || data.id;
        console.log(`[MAIL] Email sent successfully via Brevo API! MessageId: ${msgId}`);
        return { success: true, messageId: msgId };
      } else {
        console.error('[MAIL] Brevo API Error:', data);
        return { success: false, error: data.message || JSON.stringify(data) };
      }
    } else {
      // Fallback to standard SMTP
      const smtpHost = getSetting('smtp_host');
      const smtpPort = parseInt(getSetting('smtp_port') || '587');
      const smtpUser = getSetting('smtp_user');
      const smtpPass = getSetting('smtp_pass');
      const smtpFrom = getSetting('smtp_from') || 'sarah@alfa-01.com';

      if (!smtpHost || !smtpUser || !smtpPass) {
        return { success: false, error: 'SMTP settings are incomplete.' };
      }

      console.log(`[MAIL] Sending email to ${to} via SMTP Server: ${smtpHost}:${smtpPort}`);

      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPass },
        tls: { rejectUnauthorized: false },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000,
      });

      const fromHeader = senderName ? `"${senderName}" <${smtpFrom}>` : `"FPA Collections Agent" <${smtpFrom}>`;

      const info = await transporter.sendMail({
        from: fromHeader,
        to,
        subject,
        text,
        html,
        ...(replyTo ? { replyTo } : {}),
        ...(headers ? { headers } : {}),
      });

      console.log(`[MAIL] Email sent successfully via SMTP! MessageId: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    }
  } catch (error) {
    console.error('[MAIL] Error in sendMail:', error);
    return { success: false, error: String(error) };
  }
}

