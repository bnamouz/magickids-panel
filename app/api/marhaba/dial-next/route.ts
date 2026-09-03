// app/api/marhaba/dial-next/route.ts
// Vercel cron: pick highest-priority queued lead and call it via existing Nour agent
// with sales-mode prompt override.
//
// Auth: Vercel cron sends `authorization: Bearer <CRON_SECRET>` OR use ?force=1 from admin UI.
// Business hours: Sun-Thu 09-18 Israel. Override with ?force=1.

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getCurrentStaff } from '@/lib/admin/auth';
import { NOUR_SALES_FIRST_MESSAGE_TEMPLATE } from '@/lib/marhaba/prompt';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Reused from app/api/nour/outbound-call/route.ts
// Nour-Sales — dedicated agent with Hebrew prompt (marhaba sales)
// Uses Nour's phone number (Twilio caller ID) but with the sales agent's config
const NOUR_AGENT_ID = 'agent_6201m1mp2g7yee7r7jj6ke737gxj';
const NOUR_PHONE_ID = 'phnum_0801m15ct561fjsvtv8xrnddnkt5';

const CRON_SECRET = process.env.MARHABA_CRON_SECRET || '';

function inBusinessHours(): boolean {
  // Compute Israel time via Intl API
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    weekday: 'short',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const weekday = parts.find(p => p.type === 'weekday')?.value || '';
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);

  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dow = dayMap[weekday] ?? -1;

  return dow >= 0 && dow <= 4 && hour >= 9 && hour < 18;
}

async function isAuthorized(req: NextRequest): Promise<boolean> {
  // 1) Vercel cron / manual with Bearer token
  const auth = req.headers.get('authorization') || '';
  if (CRON_SECRET && auth === `Bearer ${CRON_SECRET}`) return true;
  // Vercel cron also sends this header
  if (req.headers.get('x-vercel-cron') && CRON_SECRET) return true;
  // 2) Admin UI (logged-in staff)
  const staff = await getCurrentStaff();
  if (staff) return true;
  return false;
}

async function handle(req: NextRequest): Promise<NextResponse> {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const force = url.searchParams.get('force') === '1';

  if (!force && !inBusinessHours()) {
    return NextResponse.json({ skipped: 'outside_business_hours', israel_now: new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' }) });
  }

  const supabase = getSupabaseAdmin();

  // Pick highest fit_score lead ready to call
  const nowIso = new Date().toISOString();
  const { data: lead, error: pickErr } = await supabase
    .from('marhaba_leads')
    .select('*')
    .in('status', ['new', 'queued'])
    .or(`next_action_at.is.null,next_action_at.lte.${nowIso}`)
    .order('fit_score', { ascending: false, nullsFirst: false })
    .order('imported_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (pickErr) {
    console.error('[marhaba/dial-next] pick error', pickErr);
    return NextResponse.json({ error: 'db_error', details: pickErr.message }, { status: 500 });
  }
  if (!lead) {
    return NextResponse.json({ skipped: 'no_leads_ready' });
  }

  // Mark as calling
  await supabase.from('marhaba_leads').update({ status: 'calling', last_call_at: nowIso }).eq('id', lead.id);

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'missing_elevenlabs_key' }, { status: 500 });
  }

  const firstMessage = NOUR_SALES_FIRST_MESSAGE_TEMPLATE(lead.clinic_name);

  const payload = {
    agent_id: NOUR_AGENT_ID,
    agent_phone_number_id: NOUR_PHONE_ID,
    to_number: lead.phone,
    conversation_initiation_client_data: {
      dynamic_variables: {
        marhaba_sales_mode: 'true',
        clinic_name: lead.clinic_name || '',
        contact_name: lead.contact_name || '',
        lead_id: String(lead.id),
      },
      // Nour-Sales agent has the sales prompt built-in.
      // Only override first_message with the clinic-specific greeting.
      conversation_config_override: {
        agent: {
          first_message: firstMessage,
        },
      },
    },
  };

  try {
    const resp = await fetch('https://api.elevenlabs.io/v1/convai/twilio/outbound-call', {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();

    if (!resp.ok) {
      console.error('[marhaba/dial-next] elevenlabs error', data);
      // Revert to queued with 60min delay
      await supabase
        .from('marhaba_leads')
        .update({
          status: 'queued',
          next_action_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          notes: `dial failed: ${JSON.stringify(data).slice(0, 300)}`,
        })
        .eq('id', lead.id);
      return NextResponse.json({ error: 'elevenlabs_error', details: data }, { status: 502 });
    }

    // Increment call_count
    await supabase
      .from('marhaba_leads')
      .update({ call_count: (lead.call_count || 0) + 1 })
      .eq('id', lead.id);

    return NextResponse.json({
      success: true,
      lead_id: lead.id,
      clinic_name: lead.clinic_name,
      phone: lead.phone,
      conversation_id: data.conversation_id,
      call_sid: data.callSid || data.call_sid,
    });
  } catch (err: any) {
    console.error('[marhaba/dial-next] fetch failed', err);
    await supabase
      .from('marhaba_leads')
      .update({ status: 'queued', next_action_at: new Date(Date.now() + 60 * 60 * 1000).toISOString() })
      .eq('id', lead.id);
    return NextResponse.json({ error: 'fetch_failed', details: String(err) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
