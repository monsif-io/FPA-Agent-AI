import { NextResponse } from 'next/server';
import getDb from '@/lib/db';

// POST /api/email/check-inbox - Check admin inbox for commands via IMAP
// For catchmail.io test environment, we use the API
export async function POST() {
  try {
    const db = getDb();

    const getSetting = (key: string): string => {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
      return row?.value || '';
    };

    const adminEmail = getSetting('admin_email');
    if (!adminEmail) {
      return NextResponse.json({ error: 'Admin email not configured' }, { status: 400 });
    }

    // Check if admin email is on catchmail.io (testing) or real IMAP
    if (adminEmail.includes('@catchmail.io')) {
      // Use catchmail.io API to check inbox
      const response = await fetch(
        `https://api.catchmail.io/api/v1/mailbox?address=${encodeURIComponent(adminEmail)}&page_size=10`,
        { cache: 'no-store' }
      );

      if (!response.ok) {
        return NextResponse.json({ error: 'Failed to check catchmail inbox' }, { status: 500 });
      }

      const data = await response.json();
      const messages = data.messages || [];

      // Filter for unprocessed admin command emails (not replies from clients)
      const commands = messages.filter((m: { from: string; subject: string }) => {
        const fromEmail = (m.from || '').toLowerCase();
        return fromEmail.includes(adminEmail.toLowerCase());
      });

      let processed = 0;
      for (const cmd of commands) {
        // Check if already processed
        const existing = db.prepare(
          "SELECT id FROM notifications WHERE message LIKE ? AND type = 'info'"
        ).get(`%email_cmd_${cmd.id}%`);

        if (existing) continue;

        // Read full message
        await new Promise(resolve => setTimeout(resolve, 1100));
        const msgResponse = await fetch(
          `https://api.catchmail.io/api/v1/message/${cmd.id}?mailbox=${encodeURIComponent(adminEmail)}`,
          { cache: 'no-store' }
        );

        if (!msgResponse.ok) continue;
        const msgData = await msgResponse.json();
        const body = msgData.body?.text || msgData.body?.html?.replace(/<[^>]*>/g, '') || '';

        // Process the command
        try {
          const processResponse = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/email/process`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: cmd.from || adminEmail,
              subject: cmd.subject || '',
              text: body,
            }),
          });

          if (processResponse.ok) {
            // Mark as processed
            db.prepare(`
              INSERT INTO notifications (type, title, message, is_read, created_at)
              VALUES ('info', ?, ?, 1, datetime('now'))
            `).run(
              `📧 Commande email traitée`,
              `Sujet: ${cmd.subject}\n[email_cmd_${cmd.id}]`
            );
            processed++;
          }
        } catch (err) {
          console.error('[CHECK-INBOX] Error processing command:', err);
        }
      }

      return NextResponse.json({ success: true, processed, total: commands.length });
    }

    // For real IMAP servers - use basic IMAP check
    // This requires imapflow or similar package
    // For now, we rely on the webhook/polling approach
    return NextResponse.json({
      success: true,
      message: 'IMAP inbox check not implemented for non-catchmail addresses. Use Telegram for commands.',
      processed: 0,
    });

  } catch (error) {
    console.error('[CHECK-INBOX] Error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// GET /api/email/check-inbox - Status check
export async function GET() {
  const db = getDb();
  const processed = (db.prepare("SELECT COUNT(*) as c FROM notifications WHERE title LIKE '%Commande email%'").get() as { c: number }).c;
  return NextResponse.json({ totalProcessed: processed });
}
