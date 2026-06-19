import { NextResponse } from 'next/server';
import getDb from '@/lib/db';
import nodemailer from 'nodemailer';

// POST /api/replies/check - Check for client replies via catchmail.io and notify
export async function POST() {
  try {
    const db = getDb();

    const getSetting = (key: string): string => {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
      return row?.value || '';
    };

    // Get all clients with catchmail.io emails
    const clients = db.prepare(`
      SELECT id, name, email, company, amount_due, currency
      FROM clients WHERE is_active = 1 AND email LIKE '%@catchmail.io'
    `).all() as { id: number; name: string; email: string; company: string; amount_due: number; currency: string }[];

    if (clients.length === 0) {
      return NextResponse.json({ message: 'No catchmail.io clients found', replies: [] });
    }

    const adminEmail = getSetting('admin_email');
    const botToken = getSetting('telegram_bot_token');
    const adminChatId = getSetting('telegram_admin_chat_id');
    const smtpHost = getSetting('smtp_host');
    const smtpPort = parseInt(getSetting('smtp_port') || '465');
    const smtpUser = getSetting('smtp_user');
    const smtpPass = getSetting('smtp_pass');
    const smtpFrom = getSetting('smtp_from');
    const companyName = getSetting('company_name') || 'FinancePro Advisory';

    const replies: { clientName: string; email: string; subject: string; from: string; date: string }[] = [];

    // Check each client's catchmail inbox
    for (const client of clients) {
      try {
        // Rate limit: 1 req/sec for catchmail
        await new Promise(resolve => setTimeout(resolve, 1100));

        const response = await fetch(
          `https://api.catchmail.io/api/v1/mailbox?address=${encodeURIComponent(client.email)}&page_size=10`,
          { cache: 'no-store' }
        );

        if (!response.ok) continue;

        const data = await response.json();
        const messages = data.messages || [];

        // Look for replies: messages with "Re:" in subject indicate client responses
        // Our outbound messages never start with "Re:" so this is a reliable filter
        const clientReplies = messages.filter((m: { from: string; subject: string }) => {
          const subject = (m.subject || '').toLowerCase();
          return subject.startsWith('re:') || subject.includes('re:');
        });

        for (const reply of clientReplies) {
          // Check if we already processed this reply
          const existing = db.prepare(
            "SELECT id FROM notifications WHERE title LIKE ? AND message LIKE ?"
          ).get(`%${client.name}%`, `%${reply.id}%`);

          if (existing) continue; // Already processed

          // Read full message content
          let replyBody = '';
          try {
            await new Promise(resolve => setTimeout(resolve, 1100));
            const msgResponse = await fetch(
              `https://api.catchmail.io/api/v1/message/${reply.id}?mailbox=${encodeURIComponent(client.email)}`,
              { cache: 'no-store' }
            );
            if (msgResponse.ok) {
              const msgData = await msgResponse.json();
              replyBody = msgData.body?.text || msgData.body?.html || '';
              // Clean HTML tags if any
              replyBody = replyBody.replace(/<[^>]*>/g, '').substring(0, 500);
            }
          } catch {
            replyBody = '(Contenu non disponible)';
          }

          replies.push({
            clientName: client.name,
            email: client.email,
            subject: reply.subject || '(Sans sujet)',
            from: reply.from || 'Inconnu',
            date: reply.date || new Date().toISOString(),
          });

          // ============================================
          // 1. Save notification to DB (Dashboard)
          // ============================================
          db.prepare(`
            INSERT INTO notifications (type, title, message, client_id, is_read, created_at)
            VALUES ('reply', ?, ?, ?, 0, datetime('now'))
          `).run(
            `📩 Réponse de ${client.name}`,
            `Sujet: ${reply.subject || '(Sans sujet)'}\nDe: ${reply.from}\nContenu: ${replyBody.substring(0, 300)}\n\n[ID: ${reply.id}]`,
            client.id
          );

          // Log as system message
          db.prepare(`
            INSERT INTO message_logs (client_id, channel, subject, body, status, sent_at)
            VALUES (?, 'system', ?, ?, 'sent', datetime('now'))
          `).run(
            client.id,
            `📩 Réponse client: ${reply.subject || '(Sans sujet)'}`,
            `Réponse reçue de ${reply.from}:\n${replyBody.substring(0, 500)}`
          );

          // ============================================
          // 2. Send Telegram notification
          // ============================================
          if (botToken && adminChatId) {
            const telegramMsg = `📩 *Nouvelle réponse client!*\n\n` +
              `👤 *Client:* ${client.name}\n` +
              `🏢 *Entreprise:* ${client.company || 'N/A'}\n` +
              `💰 *Montant dû:* ${new Intl.NumberFormat('fr-FR').format(client.amount_due)} ${client.currency}\n` +
              `📧 *Email:* ${client.email}\n` +
              `📋 *Sujet:* ${reply.subject || '(Sans sujet)'}\n\n` +
              `💬 *Message:*\n${replyBody.substring(0, 200)}${replyBody.length > 200 ? '...' : ''}\n\n` +
              `⏰ _${new Date(reply.date).toLocaleString('fr-FR', { timeZone: 'Africa/Casablanca' })}_`;

            try {
              await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: adminChatId,
                  text: telegramMsg,
                  parse_mode: 'Markdown',
                }),
              });
              console.log(`[REPLY-CHECK] Telegram notification sent for ${client.name}`);
            } catch (err) {
              console.error(`[REPLY-CHECK] Telegram notification failed:`, err);
            }
          }

          // ============================================
          // 3. Send email notification to admin
          // ============================================
          if (adminEmail && smtpHost) {
            try {
              const transporter = nodemailer.createTransport({
                host: smtpHost,
                port: smtpPort,
                secure: smtpPort === 465,
                auth: { user: smtpUser, pass: smtpPass },
                tls: { rejectUnauthorized: false },
              });

              await transporter.sendMail({
                from: `"FPA Collections Agent" <${smtpFrom}>`,
                to: adminEmail,
                subject: `📩 Réponse client: ${client.name} - ${reply.subject || '(Sans sujet)'}`,
                html: `
                  <div style="font-family: 'Segoe UI', Tahoma, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: linear-gradient(135deg, #C5A03D, #A68832); padding: 20px; border-radius: 12px 12px 0 0; text-align: center;">
                      <h1 style="color: #fff; margin: 0; font-size: 18px;">📩 Réponse Client Reçue</h1>
                    </div>
                    <div style="background: #fff; padding: 25px; border: 1px solid #eee; border-radius: 0 0 12px 12px;">
                      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                        <tr><td style="padding: 10px; color: #888; width: 120px;">Client</td><td style="padding: 10px; font-weight: 600;">${client.name}</td></tr>
                        <tr style="background: #f9f9f9;"><td style="padding: 10px; color: #888;">Entreprise</td><td style="padding: 10px;">${client.company || 'N/A'}</td></tr>
                        <tr><td style="padding: 10px; color: #888;">Montant dû</td><td style="padding: 10px; font-weight: 600; color: #C5A03D;">${new Intl.NumberFormat('fr-FR').format(client.amount_due)} ${client.currency}</td></tr>
                        <tr style="background: #f9f9f9;"><td style="padding: 10px; color: #888;">Email</td><td style="padding: 10px;">${client.email}</td></tr>
                        <tr><td style="padding: 10px; color: #888;">Sujet</td><td style="padding: 10px; font-weight: 600;">${reply.subject || '(Sans sujet)'}</td></tr>
                        <tr style="background: #f9f9f9;"><td style="padding: 10px; color: #888;">De</td><td style="padding: 10px;">${reply.from}</td></tr>
                      </table>
                      <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; border-left: 4px solid #C5A03D;">
                        <p style="margin: 0 0 5px; font-weight: 600; color: #3A3A3A;">💬 Contenu du message:</p>
                        <p style="margin: 0; color: #555; line-height: 1.6;">${replyBody.replace(/\n/g, '<br>')}</p>
                      </div>
                      <p style="color: #888; font-size: 12px; margin-top: 20px; text-align: center;">— FPA Collections Agent • ${new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Casablanca' })}</p>
                    </div>
                  </div>
                `,
              });
              console.log(`[REPLY-CHECK] Admin email notification sent for ${client.name}`);
            } catch (err) {
              console.error(`[REPLY-CHECK] Admin email notification failed:`, err);
            }
          }
        }
      } catch (err) {
        console.error(`[REPLY-CHECK] Error checking ${client.email}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      repliesFound: replies.length,
      replies,
    });
  } catch (error) {
    console.error('[REPLY-CHECK] Error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// GET /api/replies/check - Get reply check status
export async function GET() {
  try {
    const db = getDb();
    const replyCount = (db.prepare("SELECT COUNT(*) as c FROM notifications WHERE type = 'reply'").get() as { c: number }).c;
    const unreadReplies = (db.prepare("SELECT COUNT(*) as c FROM notifications WHERE type = 'reply' AND is_read = 0").get() as { c: number }).c;

    return NextResponse.json({ totalReplies: replyCount, unreadReplies });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
