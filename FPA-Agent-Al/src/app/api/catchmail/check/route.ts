import { NextResponse } from 'next/server';

// GET /api/catchmail/check?email=xxx@catchmail.io - Check if an email was received
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get('email');

    if (!email) {
      return NextResponse.json({ error: 'Email address required' }, { status: 400 });
    }

    // Use catchmail.io API to check mailbox
    const response = await fetch(
      `https://api.catchmail.io/api/v1/mailbox?address=${encodeURIComponent(email)}&page_size=10`,
      { cache: 'no-store' }
    );

    if (!response.ok) {
      return NextResponse.json({ 
        error: `Catchmail API error: ${response.status}`,
        messages: [],
        count: 0 
      });
    }

    const data = await response.json();
    
    return NextResponse.json({
      success: true,
      email: email,
      count: data.count || 0,
      messages: (data.messages || []).map((m: Record<string, unknown>) => ({
        id: m.id,
        from: m.from,
        subject: m.subject,
        date: m.date,
        size: m.size,
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// POST /api/catchmail/check - Read full message content
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { messageId, mailbox } = body;

    if (!messageId || !mailbox) {
      return NextResponse.json({ error: 'messageId and mailbox required' }, { status: 400 });
    }

    const response = await fetch(
      `https://api.catchmail.io/api/v1/message/${messageId}?mailbox=${encodeURIComponent(mailbox)}`,
      { cache: 'no-store' }
    );

    if (!response.ok) {
      return NextResponse.json({ error: `Catchmail API error: ${response.status}` }, { status: response.status });
    }

    const data = await response.json();
    
    return NextResponse.json({
      success: true,
      message: {
        id: data.id,
        from: data.from,
        to: data.to,
        subject: data.subject,
        date: data.date,
        body: data.body,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
