import { NextResponse } from 'next/server';
import getDb from '@/lib/db';
import nodemailer from 'nodemailer';
import { generateTrackingId, wrapEmailWithTracking } from '@/lib/tracking';

// POST /api/send-email - send an email to a specific client
export async function POST(req: Request) {
  try {
    const db = getDb();
    const body = await req.json();
    const { clientId, subject, body: emailBody, templateId } = body;

    if (!clientId) return NextResponse.json({ error: 'Client ID requis' }, { status: 400 });

    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId) as Record<string, string | number> | undefined;
    if (!client) return NextResponse.json({ error: 'Client non trouvé' }, { status: 404 });

    // Get email settings
    const getSetting = (key: string): string => {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
      return row?.value || '';
    };

    const smtpHost = getSetting('smtp_host');
    const smtpPort = parseInt(getSetting('smtp_port') || '587');
    const smtpUser = getSetting('smtp_user');
    const smtpPass = getSetting('smtp_pass');
    const smtpFrom = getSetting('smtp_from');
    const companyName = getSetting('company_name');

    // Determine email content
    let finalSubject = subject || '';
    let finalBody = emailBody || '';

    if (templateId) {
      const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(templateId) as Record<string, string> | undefined;
      if (template) {
        finalSubject = template.subject;
        finalBody = template.body;
      }
    }

    // Replace variables
    const replaceVars = (text: string) => {
      return text
        .replace(/\{\{nom\}\}/g, client.name as string)
        .replace(/\{\{name\}\}/g, client.name as string)
        .replace(/\{\{entreprise\}\}/g, (client.company as string) || '')
        .replace(/\{\{company\}\}/g, (client.company as string) || '')
        .replace(/\{\{montant\}\}/g, String(client.amount_due || 0))
        .replace(/\{\{amount\}\}/g, String(client.amount_due || 0))
        .replace(/\{\{devise\}\}/g, (client.currency as string) || 'MAD')
        .replace(/\{\{currency\}\}/g, (client.currency as string) || 'MAD')
        .replace(/\{\{date_echeance\}\}/g, (client.due_date as string) || 'N/A')
        .replace(/\{\{due_date\}\}/g, (client.due_date as string) || 'N/A')
        .replace(/\{\{company_name\}\}/g, companyName || 'FinancePro Advisory')
        .replace(/\{\{email\}\}/g, (client.email as string) || '')
        .replace(/\{\{phone\}\}/g, (client.phone as string) || '');
    };

    finalSubject = replaceVars(finalSubject);
    finalBody = replaceVars(finalBody);

    if (!finalSubject || !finalBody) {
      return NextResponse.json({ error: 'Sujet et corps du message requis' }, { status: 400 });
    }

    // Create transporter
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
      tls: { rejectUnauthorized: false },
    });

    // Generate tracking ID
    const trackingId = generateTrackingId();
    const htmlBody = wrapEmailWithTracking(finalBody.replace(/\n/g, '<br>'), trackingId);

    // Send email with tracking pixel
    await transporter.sendMail({
      from: `"${companyName}" <${smtpFrom}>`,
      to: client.email as string,
      subject: finalSubject,
      text: finalBody,
      html: htmlBody,
    });

    // Log the message with tracking ID
    db.prepare(`
      INSERT INTO message_logs (client_id, template_id, channel, subject, body, status, tracking_id, sent_at)
      VALUES (?, ?, 'email', ?, ?, 'sent', ?, datetime('now'))
    `).run(clientId, templateId || null, finalSubject, finalBody, trackingId);

    // Update client
    db.prepare(`
      UPDATE clients SET messages_sent = messages_sent + 1, last_message_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).run(clientId);

    return NextResponse.json({ success: true, message: 'Email envoyé avec succès' });
  } catch (error) {
    const db = getDb();
    const body = await req.clone().json().catch(() => ({}));
    
    // Log failed attempt
    if (body.clientId) {
      db.prepare(`
        INSERT INTO message_logs (client_id, template_id, channel, subject, body, status, error_message, sent_at)
        VALUES (?, ?, 'email', ?, ?, 'failed', ?, datetime('now'))
      `).run(body.clientId, body.templateId || null, body.subject || '', body.body || '', String(error));
    }

    console.error('Error sending email:', error);
    return NextResponse.json({ error: `Échec de l'envoi: ${error}` }, { status: 500 });
  }
}
