import { NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { sendMail } from '@/lib/mail';

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

    const defaultReply = `Bonjour,\n\nMerci pour votre rappel. Je suis au courant de cette facture et je compte effectuer le paiement avant la fin de la semaine.\n\nPeut-on discuter d'un échelonnement possible ?\n\nCordialement,\n${client.name}`;

    const message = replyMessage || defaultReply;

    // Send the reply TO the client's catchmail address (simulating the client sending from their own address)
    // We override senderName to client.name to make it show as from them, even though Brevo will send it from our verified sender account
    const mailResult = await sendMail({
      to: client.email as string,
      subject: `Re: Rappel de paiement - ${client.company || 'Facture'}`,
      text: message,
      html: message.replace(/\n/g, '<br>'),
      senderName: client.name as string,
      replyTo: `${client.name} <reply-${client.id}@client-reply.test>`,
      headers: {
        'X-Simulated-Reply': 'true',
        'X-Client-Name': client.name as string,
      },
    });

    if (!mailResult.success) {
      return NextResponse.json({ error: mailResult.error || 'Erreur lors de la simulation' }, { status: 500 });
    }


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
