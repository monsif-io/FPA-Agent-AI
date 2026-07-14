import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { updateBillingSetting } from '@/lib/billing-db';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('logo') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No logo file provided' }, { status: 400 });
    }

    // Convert file to buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Verify file is an image
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Uploaded file must be an image' }, { status: 400 });
    }

    // Ensure public folder exists
    const publicDir = path.join(process.cwd(), 'public');
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }

    // Save as logo.png
    const outputPath = path.join(publicDir, 'logo.png');
    fs.writeFileSync(outputPath, buffer);

    // Save settings key
    updateBillingSetting('company_logo_path', 'logo.png');

    console.log(`[LOGO-UPLOAD] New logo uploaded and saved to ${outputPath}`);

    return NextResponse.json({ success: true, logoPath: '/logo.png' });
  } catch (error: any) {
    console.error('Logo upload error:', error);
    return NextResponse.json({ error: 'Failed to upload logo', details: error.message }, { status: 500 });
  }
}
