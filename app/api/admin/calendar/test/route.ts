import { NextResponse } from 'next/server';
import { testConnection } from '@/lib/google-calendar';

export const dynamic = 'force-dynamic';

export async function GET() {
  const hasJson = !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const hasCalId = !!process.env.GOOGLE_CALENDAR_ID;

  if (!hasJson || !hasCalId) {
    return NextResponse.json({
      ok: false,
      configured: false,
      missing: {
        GOOGLE_SERVICE_ACCOUNT_JSON: !hasJson,
        GOOGLE_CALENDAR_ID: !hasCalId,
      },
      message: 'משתני סביבה חסרים',
    });
  }

  const result = await testConnection();
  return NextResponse.json({ configured: true, ...result });
}
