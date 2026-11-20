/**
 * Webhook event processing for the institute WhatsApp bot. All I/O is injected
 * (store, sender, model) so the full decision path is unit tested.
 *
 * Invariants:
 *  - The only outbound action is a reply to the same 1:1 chat that wrote to us.
 *    Nothing is ever forwarded to another number.
 *  - Each provider message id is claimed once (DB unique constraint).
 *  - Our own replies are recognised (marker, referenceId, recorded body) and never answered.
 *  - A staff message typed on the phone pauses the bot for that chat.
 *  - Per-chat and global caps are enforced atomically in SQL before any send.
 */
import type { VoiceLinkKey } from '@/lib/voice/links';
import { type BotConfig, type WaEvent, classifyOutgoing, detectLanguage, ignoreReason, isOfficeHours, isTextMessage, staffTrigger } from './guards';
import { TEMPLATES, buildMessages, composeMessage, type HistoryItem, type ModelReply } from './reply';

export type ChatRow = {
  chat_phone: string; paused_until: string | null; needs_staff: boolean; language: string | null;
};
export type ReserveResult = { result: string; id?: string; reference_id?: string };
export interface Store {
  /** Inserts the event row keyed by provider_id; 'duplicate' if it already exists. */
  claim(row: { chat_phone: string; chat_id: string; name: string; direction: 'inbound' | 'staff' | 'bot_echo'; status: 'received' | 'matched'; provider_id: string; reference_id: string | null; body: string; type: string; mode: string; meta: Record<string, unknown> }): Promise<{ status: 'claimed'; id: string; previous: ChatRow | null } | { status: 'duplicate' }>;
  recentBot(chat_phone: string, minutes: number): Promise<{ id: string; reference_id: string | null; body: string | null }[]>;
  updateMessage(id: string, patch: { direction?: string; status?: string; meta?: Record<string, unknown>; send_id?: string | null }): Promise<void>;
  history(chat_phone: string, limit: number, excludeId: string): Promise<HistoryItem[]>;
  pause(chat_phone: string, until: Date, reason: 'staff_takeover' | 'manual'): Promise<void>;
  flag(chat_phone: string, reason: string): Promise<void>;
  reserve(args: { chat_phone: string; body: string; mode: 'shadow' | 'on'; type: string; chatCap: number; globalCap: number; windowMinutes: number; meta: Record<string, unknown> }): Promise<ReserveResult>;
}
export type Sender = (args: { toPhone: string; body: string; referenceId: string }) => Promise<{ ok: boolean; id?: string; error?: string }>;
export type Model = (messages: ReturnType<typeof buildMessages>) => Promise<ModelReply | null>;

export type Outcome = { action: string; reason?: string; reply?: string };

export async function processEvent(e: WaEvent, deps: { store: Store; send: Sender; model: Model; config: BotConfig; now?: () => Date }): Promise<Outcome> {
  const { store, config } = deps;
  const now = deps.now ?? (() => new Date());
  const ignored = ignoreReason(e, config);
  if (ignored) return { action: 'ignored', reason: ignored };

  // Outgoing (fromMe): either the echo of our own reply or staff typing → takeover.
  if (e.fromMe) {
    const recent = await store.recentBot(e.chatPhone, 30);
    const kind = classifyOutgoing(e, recent);
    const claimed = await store.claim({ chat_phone: e.chatPhone, chat_id: e.chatId, name: '', direction: kind, status: kind === 'bot_echo' ? 'matched' : 'received', provider_id: e.providerId!, reference_id: null, body: e.body, type: e.type, mode: config.mode, meta: { event: e.event, reference_id: e.referenceId } });
    if (claimed.status === 'duplicate') return { action: 'duplicate' };
    if (kind === 'bot_echo') return { action: 'bot_echo' };
    const until = new Date(now().getTime() + config.takeoverHours * 3600_000);
    await store.pause(e.chatPhone, until, 'staff_takeover');
    return { action: 'staff_takeover', reason: until.toISOString() };
  }

  const lang = detectLanguage(e.body);
  const claimed = await store.claim({ chat_phone: e.chatPhone, chat_id: e.chatId, name: e.name, direction: 'inbound', status: 'received', provider_id: e.providerId!, reference_id: null, body: e.body, type: e.type, mode: config.mode, meta: { event: e.event, language: lang } });
  if (claimed.status === 'duplicate') return { action: 'duplicate' };
  if (config.mode === 'off') return { action: 'logged', reason: 'mode_off' };

  const prev = claimed.previous;
  if (prev?.paused_until && new Date(prev.paused_until) > now()) { await store.updateMessage(claimed.id, { status: 'skipped', meta: { skip: 'paused' } }); return { action: 'skipped', reason: 'paused' }; }
  if (prev?.needs_staff) { await store.updateMessage(claimed.id, { status: 'skipped', meta: { skip: 'needs_staff' } }); return { action: 'skipped', reason: 'needs_staff' }; }

  const firstMessage = !prev;
  const afterHoursNote = firstMessage && !isOfficeHours(now());
  let reply: string, linkKeys: VoiceLinkKey[] = [], staffReason: string | null = null, emergency = false;

  if (!isTextMessage(e)) {
    reply = TEMPLATES.nonText[lang];
    staffReason = `non_text:${e.type}`;
  } else {
    const trigger = staffTrigger(e.body);
    const history = await store.history(e.chatPhone, 10, claimed.id);
    const model = await deps.model(buildMessages(lang, history, e.body));
    if (!model) {
      await store.flag(e.chatPhone, 'ai_failed');
      await store.updateMessage(claimed.id, { status: 'skipped', meta: { skip: 'ai_failed' } });
      return { action: 'flagged', reason: 'ai_failed' };
    }
    linkKeys = model.link_keys;
    emergency = trigger === 'urgent';
    if (model.needs_staff || trigger) {
      staffReason = [trigger, model.reason || (model.needs_staff ? 'model_needs_staff' : '')].filter(Boolean).join(': ').slice(0, 200);
      reply = model.reply || TEMPLATES.staff[lang];
    } else reply = model.reply;
  }

  if (staffReason) await store.flag(e.chatPhone, staffReason);
  const body = composeMessage({ reply, linkKeys, lang, afterHoursNote, emergency });
  const mode = config.mode as 'shadow' | 'on';
  const reserved = await store.reserve({ chat_phone: e.chatPhone, body, mode, type: 'chat', chatCap: config.chatCap, globalCap: config.globalCap, windowMinutes: config.windowMinutes, meta: { in_reply_to: claimed.id, link_keys: linkKeys, staff_reason: staffReason, language: lang } });
  if (reserved.result !== 'ok' || !reserved.id || !reserved.reference_id) {
    await store.updateMessage(claimed.id, { status: 'skipped', meta: { skip: reserved.result } });
    return { action: 'skipped', reason: reserved.result };
  }
  if (mode === 'shadow') return { action: 'shadow', reply: body };

  const sent = await deps.send({ toPhone: `+${e.chatPhone}`, body, referenceId: reserved.reference_id });
  const status = sent.ok ? 'sent' : sent.error === 'send_uncertain' ? 'uncertain' : 'failed';
  await store.updateMessage(reserved.id, { status, send_id: sent.id ?? null, meta: sent.ok ? {} : { error: sent.error } });
  if (!sent.ok) await store.flag(e.chatPhone, `send_${status}`);
  return { action: status, reply: body };
}
