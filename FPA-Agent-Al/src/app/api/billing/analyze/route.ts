import { NextResponse } from 'next/server';
import { analyzeInvoiceDocument } from '@/lib/invoice-analyzer';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const prompt = formData.get('prompt') as string | null;

    if (!file && !prompt) {
      return NextResponse.json({ error: 'Either a file upload or text prompt is required' }, { status: 400 });
    }

    let fileBase64 = '';
    let mimeType = '';

    if (file) {
      const buffer = Buffer.from(await file.arrayBuffer());
      fileBase64 = buffer.toString('base64');
      mimeType = file.type;
    }

    const data = await analyzeInvoiceDocument(fileBase64 || undefined, mimeType || undefined, prompt || undefined);
    
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('Invoice analysis route error:', error);
    return NextResponse.json({ error: error.message || 'Failed to analyze document' }, { status: 500 });
  }
}
