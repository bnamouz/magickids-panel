import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'yaldey-mvp',
    version: '0.1.0',
    time: new Date().toISOString(),
    db_configured: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
}
