# Voice AI Agent API (`/api/voice/*`)

Backend endpoints for the ElevenLabs Conversational AI voice secretary
("רנא" / Rana) that answers the Magic Kids clinic phone (0544020043 via
Twilio call-forwarding).

## Endpoints

| Method | Path | Purpose | Called from |
|---|---|---|---|
| GET  | `/api/voice/intake-status`   | Check if parent + teacher questionnaires are complete | Agent tool `check_intake_status` |
| GET  | `/api/voice/maccabi-slots`   | List up to 3 free 60-min slots on Wednesdays 16-20   | Agent tool `get_maccabi_slots` |
| POST | `/api/voice/book-maccabi`    | Create the Maccabi assessment appointment (gated)    | Agent tool `book_maccabi_appointment` |
| POST | `/api/voice/send-intake-link`| WhatsApp the parent the registration + questionnaire | Agent tool `send_intake_link` |
| POST | `/api/voice/escalate`        | Urgent WhatsApp alert to Dr. Baseem (0544020043)     | Agent tool `escalate_to_human` |
| POST | `/api/voice/call-log`        | Persist post-call summary to `voice_calls`           | ElevenLabs post-call webhook |

All endpoints require a shared bearer token:
```
Authorization: Bearer $VOICE_AGENT_TOKEN
```

## Booking policy (enforced server-side)

`POST /api/voice/book-maccabi` rejects the request unless **all** are true:
1. `slot_iso` falls on a Wednesday between 16:00 and 20:00 Asia/Jerusalem.
2. The referenced `intake_sessions` row has both `parent_completed_at` and
   `teacher_completed_at` set (i.e. the Vanderbilt gate).
3. The 60-minute slot is still free in the MAGIC KIDS Google Calendar.

This means even if the ElevenLabs agent's prompt drifts, it cannot bypass the
questionnaire requirement — the server refuses.

## Environment variables

Existing (already configured in Vercel):
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `GOOGLE_SERVICE_ACCOUNT_JSON`
- `GOOGLE_CALENDAR_ID`
- `GOOGLE_IMPERSONATE_USER` (optional, for domain-wide delegation)
- `ULTRAMSG_INSTANCE_ID`
- `ULTRAMSG_TOKEN`

New (add before deploying):
- `VOICE_AGENT_TOKEN` — long random string. Paste the same value in the
  Authorization header configured for every ElevenLabs webhook tool.
- `ESCALATION_WHATSAPP` — E.164 number that receives urgent alerts.
  Defaults to `+972544020043` if unset.
- `NEXT_PUBLIC_APP_BASE_URL` — base URL for the registration link
  (e.g. `https://app.magickidsinstitute.com`).

## Database

Run the migration once against the project's Supabase:
```
db/migrations/20260828_voice_calls.sql
```
It creates `public.voice_calls` with RLS policies:
- Staff (rows in `staff_users`) can `SELECT`.
- Only the service role (server-side inserts) can write.

## Configuring the ElevenLabs agent tools

For every tool, choose **Webhook** and paste the following:

### `check_intake_status`
- Method: `GET`
- URL: `https://app.magickidsinstitute.com/api/voice/intake-status?phone={{caller_phone}}`
- Headers: `Authorization: Bearer ${VOICE_AGENT_TOKEN}`

### `get_maccabi_slots`
- Method: `GET`
- URL: `https://app.magickidsinstitute.com/api/voice/maccabi-slots?max=3&weeks_ahead=4`
- Headers: `Authorization: Bearer ${VOICE_AGENT_TOKEN}`

### `book_maccabi_appointment`
- Method: `POST`
- URL: `https://app.magickidsinstitute.com/api/voice/book-maccabi`
- Headers: `Authorization: Bearer ${VOICE_AGENT_TOKEN}`, `content-type: application/json`
- Body (JSON), variables filled by the agent:
  ```json
  {
    "case_id": "{{case_id}}",
    "parent_name": "{{parent_name}}",
    "parent_phone": "{{caller_phone}}",
    "child_name": "{{child_name}}",
    "child_age": {{child_age}},
    "slot_iso": "{{selected_slot_iso}}",
    "language": "{{spoken_language}}",
    "notes": "{{call_notes}}"
  }
  ```

### `send_intake_link`
- Method: `POST`
- URL: `https://app.magickidsinstitute.com/api/voice/send-intake-link`
- Body:
  ```json
  {
    "phone": "{{caller_phone}}",
    "parent_name": "{{parent_name}}",
    "child_name": "{{child_name}}",
    "language": "{{spoken_language}}",
    "reason": "maccabi_gate"
  }
  ```

### `escalate_to_human`
- Method: `POST`
- URL: `https://app.magickidsinstitute.com/api/voice/escalate`
- Body:
  ```json
  {
    "caller_phone": "{{caller_phone}}",
    "caller_name": "{{parent_name}}",
    "child_name": "{{child_name}}",
    "reason": "{{escalation_reason}}",
    "summary": "{{call_summary}}",
    "language": "{{spoken_language}}"
  }
  ```

### Post-call webhook (`call-log`)
Register in the agent settings under Post-call webhook:
- URL: `https://app.magickidsinstitute.com/api/voice/call-log`
- Method: `POST`
- Headers: `Authorization: Bearer ${VOICE_AGENT_TOKEN}`
- Body: mapped from the ElevenLabs data-collection fields.

## Local testing

Once the env vars are set, you can smoke-test with curl:

```bash
export TOKEN=your_voice_agent_token
export BASE=https://app.magickidsinstitute.com

# 1. Check intake status by phone
curl -H "Authorization: Bearer $TOKEN" \
  "$BASE/api/voice/intake-status?phone=%2B972544020043"

# 2. Get Wednesday slots
curl -H "Authorization: Bearer $TOKEN" \
  "$BASE/api/voice/maccabi-slots?max=3"

# 3. Try to book (should 409 unless intake complete)
curl -X POST -H "Authorization: Bearer $TOKEN" \
     -H "content-type: application/json" \
     "$BASE/api/voice/book-maccabi" -d '{
       "case_id":"00000000-0000-0000-0000-000000000000",
       "parent_name":"Test",
       "parent_phone":"+972544020043",
       "child_name":"Test Child",
       "slot_iso":"2026-09-02T13:00:00Z",
       "language":"he"
     }'

# 4. Send intake link
curl -X POST -H "Authorization: Bearer $TOKEN" \
     -H "content-type: application/json" \
     "$BASE/api/voice/send-intake-link" -d '{
       "phone":"+972544020043",
       "language":"he",
       "reason":"new_family"
     }'

# 5. Escalate
curl -X POST -H "Authorization: Bearer $TOKEN" \
     -H "content-type: application/json" \
     "$BASE/api/voice/escalate" -d '{
       "caller_phone":"+972544020043",
       "reason":"request_human",
       "summary":"Test escalation"
     }'
```
