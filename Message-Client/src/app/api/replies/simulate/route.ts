import { NextResponse } from 'next/server';
import getDb from '@/lib/db';
import nodemailer from 'nodemailer';

// POST /api/replies/simulate - Simulate a client reply by sending an email TO the client's catchmail address
export async function POST(req: Request) {
  try {
    const db = getDb();
    const body = await req.json();
    const { clientId, replyMessage } = body;

    if (!clientId) {
      return NextResponse.json({ error: 'clientId requis' }, { status: 400 });
    }

    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId) as Record<string, string | number> | undefined;
    if (!client) {
      return NextResponse.json({ error: 'Client non trouvé' }, { status: 404 });
    }

    const getSetting = (key: string): string => {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
      return row?.value || '';
    };

    const smtpHost = getSetting('smtp_host');
    const smtpPort = parseInt(getSetting('smtp_port') || '465');
    const smtpUser = getSetting('smtp_user');
    const smtpPass = getSetting('smtp_pass');

    // Send the "reply" email to the client's catchmail address
    // We send from a DIFFERENT from name to simulate the client replying
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
      tls: { rejectUnauthorized: false },
    });

    const defaultReply = `Bonjour,\n\nMerci pour votre rappel. Je suis au courant de cette facture et je compte effectuer le paiement avant la fin de la semaine.\n\nPeut-on discuter d'un échelonnement possible ?\n\nCordialement,\n${client.name}`;

    const message = replyMessage || defaultReply;

    // Send the reply TO the client's catchmail address (simulating the client sending from their own address)
    // We use a different "from" name to distinguish it from our sent emails
    await transporter.sendMail({
      from: `"${client.name}" <${smtpUser}>`,
      to: client.email as string,
      subject: `Re: Rappel de paiement - ${client.company || 'Facture'}`,
      text: message,
      html: message.replace(/\n/g, '<br>'),
      headers: {
        'X-Simulated-Reply': 'true',
        'X-Client-Name': client.name as string,
        'Reply-To': `${client.name} <reply-${client.id}@client-reply.test>`,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Réponse simulée envoyée à ${client.email}`,
      client: { id: client.id, name: client.name, email: client.email },
    });
  } catch (error) {
    console.error('[SIMULATE-REPLY] Error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
