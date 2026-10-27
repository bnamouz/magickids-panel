import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase';
import { checkOne, markReady, sendReminder, setStatus, type CommitmentRow } from '@/lib/maccabi/commitment-service';
import { readAccess } from '@/lib/maccabi/gmail';
import { guard, reply } from '../../_guard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const Schema = z.object({ action: z.enum(['check', 'remind', 'ready', 'rejected', 'cancel', 'reopen', 'notify_again']), lang: z.enum(['he', 'ar']).default('he') });

/** POST – manual actions on one request: check mail now, remind, mark ready (sends WhatsApp), mark rejected, cancel, reopen, resend WhatsApp. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(req, true); if ('error' in g) return g.error;
  const { id } = await params;
  const body = Schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return reply({ error: 'invalid_body' }, 400);
  const { data } = await getSupabaseAdmin().from('maccabi_commitments').select('*').eq('id', id).maybeSingle();
  if (!data) return reply({ error: 'not_found' }, 404);
  const row = data as CommitmentRow;
  const actor = g.staff.id;
  try {
    switch (body.data.action) {
      case 'check': {
        const access = await readAccess();
        if (access !== 'ok') return reply({ error: 'mail_read_' + access }, 409);
        return reply({ ok: true, result: await checkOne(row, actor) });
      }
      case 'remind': {
        if (!['sent', 'reminded', 'reply_received'].includes(row.status)) return reply({ error: 'not_open' }, 409);
        return reply({ ok: true, commitment: await sendReminder(row, actor) });
      }
      case 'ready': {
        if (row.status === 'cancelled') return reply({ error: 'cancelled' }, 409);
        const r = await markReady(row, 'manual', actor, body.data.lang);
        return reply({ ok: true, commitment: r.row, whatsapp: { ok: r.whatsapp.ok, sender: r.whatsapp.sender, error: r.whatsapp.ok ? null : r.whatsapp.error } });
      }
      case 'notify_again': {
        if (row.status !== 'ready') return reply({ error: 'not_ready' }, 409);
        const r = await markReady(row, row.ready_source ?? 'manual', actor, body.data.lang);
        return reply({ ok: true, commitment: r.row, whatsapp: { ok: r.whatsapp.ok, sender: r.whatsapp.sender, error: r.whatsapp.ok ? null : r.whatsapp.error } });
      }
      case 'rejected': return reply({ ok: true, commitment: await setStatus(row, 'rejected', actor) });
      case 'cancel': return reply({ ok: true, commitment: await setStatus(row, 'cancelled', actor) });
      case 'reopen': return reply({ ok: true, commitment: await setStatus(row, 'sent', actor) });
    }
  } catch (e) {
    return reply({ error: e instanceof Error && /unauthorized|403|insufficient/i.test(e.message) ? 'mail_read_unauthorized' : 'action_failed' }, 502);
  }
}
