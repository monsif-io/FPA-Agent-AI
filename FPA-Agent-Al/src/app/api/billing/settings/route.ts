import { NextResponse } from 'next/server';
import { getBillingSettings, updateBillingSetting } from '@/lib/billing-db';

export async function GET() {
  try {
    const settings = getBillingSettings();
    return NextResponse.json({ settings });
  } catch (error) {
    console.error('Fetch billing settings error:', error);
    return NextResponse.json({ error: 'Failed to fetch billing settings' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { settings } = body;
    if (!settings || typeof settings !== 'object') {
      return NextResponse.json({ error: 'Invalid settings object' }, { status: 400 });
    }

    Object.entries(settings).forEach(([key, val]) => {
      updateBillingSetting(key, String(val));
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update billing settings error:', error);
    return NextResponse.json({ error: 'Failed to save billing settings' }, { status: 500 });
  }
}
