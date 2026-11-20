import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { sendInstituteWhatsAppText } from '@/lib/whatsapp-ultramsg';
import { instanceMatches, parseEvent, readConfig, secretMatches } from '@/lib/institute-wa/guards';
import { processEvent } from '@/lib/institute-wa/process';
import { generateModelReply } from '@/lib/institute-wa/reply';
import { supabaseStore } from '@/lib/institute-wa/store';

/**
 * POST /api/whatsapp/institute/webhook?key=INSTITUTE_WA_WEBHOOK_SECRET
 * UltraMsg webhook (message_received + message_create) for the institute number
 * 054-402-0043. See docs/institute-whatsapp-bot.md. Never forwards messages.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ok = (extra: Record<string, unknown> = {}) => NextResponse.json({ ok: true, ...extra }, { headers: { 'Cache-Control': 'no-store' } });

/** Vercel's request-context waitUntil (same mechanism as @vercel/functions); null when unavailable. */
function waitUntil(task: Promise<unknown>): boolean {
  const ctx = (globalThis as any)[Symbol.for('@vercel/request-context')]?.get?.();
  if (typeof ctx?.waitUntil !== 'function') return false;
  ctx.waitUntil(task);
  return true;
}

export async function POST(req: NextRequest) {
  if (!secretMatches(req.nextUrl.searchParams.get('key'), process.env.INSTITUTE_WA_WEBHOOK_SECRET)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const payload = await req.json().catch(() => null);
  if (!payload || !instanceMatches(payload.instanceId ?? payload.instance_id, process.env.MAGIC_KIDS_ULTRAMSG_INSTANCE_ID)) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  const event = parseEvent(payload);
  if (!event) return ok({ ignored: 'invalid' });
  const config = readConfig();

  const task = processEvent(event, {
    store: supabaseStore(getSupabaseAdmin()),
    config,
    model: (messages) => generateModelReply(messages),
    send: ({ toPhone, body, referenceId }) => sendInstituteWhatsAppText({ toPhone, body, referenceId }),
  }).then((outcome) => {
    console.log('[institute-wa]', JSON.stringify({ action: outcome.action, reason: outcome.reason, mode: config.mode }));
    return outcome;
  }).catch((err) => {
    // No message bodies or phone numbers in logs.
    console.error('[institute-wa] processing_failed', err instanceof Error ? err.message : 'unknown');
    return { action: 'error' };
  });

  // Answer UltraMsg immediately when the platform supports background work; otherwise finish inline.
  if (waitUntil(task)) return ok({ queued: true });
  const outcome = await task;
  return ok({ action: outcome.action });
}
