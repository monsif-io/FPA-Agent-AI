import { randomBytes } from 'crypto';

/**
 * Generate a unique tracking ID for email open tracking
 */
export function generateTrackingId(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Generate the tracking pixel HTML to embed in emails
 */
export function getTrackingPixelHtml(trackingId: string, baseUrl?: string): string {
  const url = baseUrl || process.env.NEXTAUTH_URL || 'http://localhost:3000';
  return `<img src="${url}/api/track/${trackingId}" width="1" height="1" style="display:none;width:1px;height:1px;border:0;" alt="" />`;
}

/**
 * Wrap email HTML body with tracking pixel
 */
export function wrapEmailWithTracking(htmlBody: string, trackingId: string, baseUrl?: string): string {
  const pixel = getTrackingPixelHtml(trackingId, baseUrl);
  // Add pixel at the end of the email
  return `${htmlBody}${pixel}`;
}
