import type { SupabaseClient } from '@supabase/supabase-js';
import type { Store, ChatRow } from './process';

/** Supabase (service role) implementation of the bot store. */
export function supabaseStore(db: SupabaseClient): Store {
  return {
    async claim(row) {
      const prev = await db.from('institute_wa_chats').select('chat_phone,paused_until,needs_staff,language').eq('chat_phone', row.chat_phone).maybeSingle();
      if (prev.error) throw new Error('chat_read_failed');
      const at = new Date().toISOString();
      const chat: Record<string, unknown> = { chat_phone: row.chat_phone, chat_id: row.chat_id.slice(0, 80), updated_at: at };
      if (row.name) chat.name = row.name;
      if (row.direction === 'inbound') {
        chat.last_inbound_at = at;
        chat.last_preview = row.body.slice(0, 200) || `[${row.type}]`;
        if (typeof row.meta.language === 'string') chat.language = row.meta.language;
      }
      const up = await db.from('institute_wa_chats').upsert(chat, { onConflict: 'chat_phone' });
      if (up.error) throw new Error('chat_upsert_failed');
      const ins = await db.from('institute_wa_messages').insert({
        chat_phone: row.chat_phone, direction: row.direction, status: row.status, provider_id: row.provider_id,
        reference_id: row.reference_id, body: row.body, type: row.type, mode: row.mode, meta: row.meta,
      }).select('id').single();
      if (ins.error) {
        if (ins.error.code === '23505') return { status: 'duplicate' };
        throw new Error('claim_failed');
      }
      return { status: 'claimed', id: ins.data.id, previous: (prev.data as ChatRow | null) ?? null };
    },
    async recentBot(chat_phone, minutes) {
      const since = new Date(Date.now() - minutes * 60_000).toISOString();
      const r = await db.from('institute_wa_messages').select('id,reference_id,body').eq('chat_phone', chat_phone).eq('direction', 'bot').gte('created_at', since).limit(50);
      if (r.error) throw new Error('recent_failed');
      return r.data ?? [];
    },
    async updateMessage(id, patch) {
      const update: Record<string, unknown> = {};
      if (patch.direction) update.direction = patch.direction;
      if (patch.status) update.status = patch.status;
      if (patch.send_id !== undefined) update.send_id = patch.send_id;
      if (patch.meta && Object.keys(patch.meta).length) {
        const cur = await db.from('institute_wa_messages').select('meta').eq('id', id).maybeSingle();
        update.meta = { ...((cur.data?.meta as object) ?? {}), ...patch.meta };
      }
      if (!Object.keys(update).length) return;
      const r = await db.from('institute_wa_messages').update(update).eq('id', id);
      if (r.error) throw new Error('update_failed');
    },
    async history(chat_phone, limit, excludeId) {
      const r = await db.from('institute_wa_messages').select('direction,body,status').eq('chat_phone', chat_phone)
        .in('direction', ['inbound', 'bot', 'staff']).neq('id', excludeId).order('created_at', { ascending: false }).limit(limit);
      if (r.error) throw new Error('history_failed');
      return (r.data ?? []).filter((m) => m.direction !== 'bot' || ['sent', 'shadow', 'sending', 'uncertain'].includes(m.status)).reverse();
    },
    async pause(chat_phone, until, reason) {
      const r = await db.from('institute_wa_chats').update({ paused_until: until.toISOString(), paused_reason: reason, last_outbound_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('chat_phone', chat_phone);
      if (r.error) throw new Error('pause_failed');
    },
    async flag(chat_phone, reason) {
      const r = await db.from('institute_wa_chats').update({ needs_staff: true, staff_reason: reason.slice(0, 200), staff_flagged_at: new Date().toISOString(), handled_at: null, updated_at: new Date().toISOString() }).eq('chat_phone', chat_phone);
      if (r.error) throw new Error('flag_failed');
    },
    async reserve(a) {
      const r = await db.rpc('institute_wa_reserve_reply', { p_chat: a.chat_phone, p_body: a.body, p_mode: a.mode, p_type: a.type, p_chat_cap: a.chatCap, p_global_cap: a.globalCap, p_window_minutes: a.windowMinutes, p_meta: a.meta });
      if (r.error || !r.data) return { result: 'reserve_failed' };
      return r.data as { result: string; id?: string; reference_id?: string };
    },
  };
}
