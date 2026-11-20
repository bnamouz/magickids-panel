# Institute WhatsApp auto-reply bot (054-402-0043)

Automatic replies on the Magic Kids Institute WhatsApp number (UltraMsg
`instance173060`). Staff review everything at `/admin/whatsapp-inbox`
(folder "תקשורת" → "וואטסאפ המכון — פניות").

## Safety model (lessons from the 22.10.2026 loop)

The old bot (`drbasem-whatsapp-bot`) forwarded every institute message to the
owner's personal number, re-received its own envelopes and sent ~113 messages.
This bot is built so that cannot happen:

- **No forwarding.** The only outbound action is a reply to the same 1:1 chat
  that wrote. Staff escalation is a flag in the panel, never a WhatsApp message.
- **Ignored entirely:** groups (`@g.us`), status/broadcast, newsletters, `@lid`
  aliases, the institute number 972544020043, internal numbers 972509955137 and
  972543496656 (plus the 163969486553100 alias that looped), every number in
  `INSTITUTE_WA_IGNORE`, internal display names, and any text carrying a bot
  envelope marker (old bot patterns, and the invisible marker every reply of this
  bot ends with).
- **Dedupe.** Every event is claimed by its provider message id
  (`institute_wa_messages.provider_id` unique). Retries and the
  `message_received` + `message_create` pair for the same message reply once.
- **Echo recognition.** Replies are sent with an UltraMsg `referenceId`
  (`mkbot-…`), recorded before sending, and carry an invisible marker. The
  `message_create` echo is matched by marker, referenceId or recorded body and is
  never answered.
- **Caps** (atomic, in SQL `institute_wa_reserve_reply`, serialised by an
  advisory lock): max `INSTITUTE_WA_CHAT_CAP` (5) replies per chat per
  `INSTITUTE_WA_CHAT_WINDOW_MINUTES` (60); then silent and flagged for staff.
  Global max `INSTITUTE_WA_GLOBAL_CAP` (60) replies per hour across all chats.
- **Human takeover.** A `message_create` from our number that is not one of the
  bot's own replies (staff typed on the phone / WhatsApp Web) pauses the bot in
  that chat for `INSTITUTE_WA_TAKEOVER_HOURS` (12). Note: messages sent by other
  panel features from the same number (Sarah's send-link, MOXO confirmations,
  appointment confirmations) also count as takeover — conservative by design.
- **Flagged chats stay silent** until staff press "סימון כטופל".
- **Fail closed.** If the model fails or returns invalid JSON, nothing is sent
  and the chat is flagged. A send timeout is stored as `uncertain` and never retried.

## Reply logic

- Language: Hebrew or Arabic (colloquial Palestinian), by the sender's script.
- Model: OpenAI chat completions (`INSTITUTE_WA_MODEL`, default `gpt-4o-mini`),
  JSON mode, last 10 messages of the chat as history. The system prompt is
  condensed from `agents/sarah/prompt.md` (`lib/institute-wa/reply.ts`). When the
  panel knowledge changes, update `INSTITUTE_KNOWLEDGE` there too.
- Output `{reply, link_keys[], needs_staff, reason}` is validated in code. URLs
  written by the model are removed; links are appended by code only from the
  approved map in `lib/voice/links.ts` (max 3), and every link message ends with
  the institute website line.
- Escalation (model `needs_staff`, or deterministic triggers for urgent,
  complaint, document requests): polite "the team will contact you" reply and a
  staff flag. Urgent messages also get the MDA 101 line.
- Non-text messages (voice, image, document…): a short request to write in text,
  plus a staff flag.
- The first message of a chat outside office hours (Sun–Thu 09:00–19:00,
  Fri 09:00–13:00, Israel time; `isOfficeHours` in `lib/institute-wa/guards.ts`)
  adds a line that the team will also follow up.

## Environment variables (Vercel project `magickids-panel`)

| Variable | Required | Notes |
|---|---|---|
| `INSTITUTE_WA_WEBHOOK_SECRET` | yes | Long random string, used as `?key=`. Compared in constant time. |
| `INSTITUTE_WA_AUTOREPLY` | no | `off` \| `shadow` \| `on`. Default `shadow`. |
| `MAGIC_KIDS_ULTRAMSG_INSTANCE_ID` / `MAGIC_KIDS_ULTRAMSG_TOKEN` | existing | Payload `instanceId` must match; sender identity verified on every send. |
| `OPENAI_API_KEY` | existing | |
| `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL` | existing | |
| `INSTITUTE_WA_IGNORE` | no | Extra numbers to never answer (comma separated, 05… or 972…). |
| `INSTITUTE_WA_CHAT_CAP` / `INSTITUTE_WA_CHAT_WINDOW_MINUTES` | no | Defaults 5 / 60. |
| `INSTITUTE_WA_GLOBAL_CAP` | no | Default 60 per hour. |
| `INSTITUTE_WA_TAKEOVER_HOURS` | no | Default 12. |
| `INSTITUTE_WA_MODEL` | no | Default `gpt-4o-mini`. |

## Database

Apply `supabase/migrations/20261120120000_institute_whatsapp_bot.sql`
(tables `institute_wa_chats`, `institute_wa_messages`, function
`institute_wa_reserve_reply`). RLS enabled with no policies: service role only.

## UltraMsg setup (instance173060)

Webhook URL:

```
https://app.magickidsinstitute.com/api/whatsapp/institute/webhook?key=<INSTITUTE_WA_WEBHOOK_SECRET>
```

Enable **webhook_message_received** and **webhook_message_create** (create is
needed for echo recognition and human takeover). Leave `message_ack` and
`download_media` off.

## Rollout

1. Apply the migration. Set `INSTITUTE_WA_WEBHOOK_SECRET` and
   `INSTITUTE_WA_AUTOREPLY=shadow`. Deploy.
2. Set the webhook URL in UltraMsg and enable the two events.
3. Shadow for a few days: drafts appear in `/admin/whatsapp-inbox` with a dashed
   amber border ("טיוטת בוט — לא נשלחה"). Review tone, links and escalations.
4. Switch to `INSTITUTE_WA_AUTOREPLY=on` and redeploy.

## Kill switch

- Fastest: set `INSTITUTE_WA_AUTOREPLY=off` (or `shadow`) and redeploy — inbound is
  still logged, nothing is sent.
- Hard stop: clear the webhook URL in UltraMsg (as done on 22.10.2026).
- One chat: "השהיית הבוט בשיחה" in the inbox (7 days), or just type in the chat
  from the phone (12h takeover).
- Removing `INSTITUTE_WA_WEBHOOK_SECRET` makes every webhook call return 401.

## Tests

`npm run test:institute-wa` — guards, dedupe, modes, caps, takeover, echo
recognition, JSON validation and message composition, against the real
migration in PGlite. No network calls and no WhatsApp messages.
