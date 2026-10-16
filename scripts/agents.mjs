#!/usr/bin/env node
/**
 * Voice agents as code: Sarah (institute) and Nour (personal).
 *
 *   node scripts/agents.mjs pull    # live ElevenLabs -> agents/<name>/ (secrets redacted)
 *   node scripts/agents.mjs check   # compare repo with live; exit 1 on drift
 *   node scripts/agents.mjs push    # repo prompt + first message -> live (only what changed)
 *
 * Env: ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID (Sarah), NOUR_ELEVENLABS_AGENT_ID.
 * Tool definitions are versioned for review and drift detection, but `push` only
 * updates the prompt and first message. Tool headers carry VOICE_AGENT_TOKEN,
 * which is never written to the repo.
 */
import fs from 'node:fs';
import path from 'node:path';

const API = 'https://api.elevenlabs.io/v1/convai/agents';
const KEY = process.env.ELEVENLABS_API_KEY?.trim();
const AGENTS = {
  sarah: process.env.ELEVENLABS_AGENT_ID?.trim(),
  nour: process.env.NOUR_ELEVENLABS_AGENT_ID?.replace(/\\n/g, '').trim(),
};
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'agents');
const REDACTED = 'Bearer ${VOICE_AGENT_TOKEN}';

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (/^authorization$/i.test(k) && typeof v === 'string') out[k] = REDACTED;
      else if (/secret|api[_-]?key|token/i.test(k) && typeof v === 'string' && v.length > 12) out[k] = '${REDACTED}';
      else out[k] = redact(v);
    }
    return out;
  }
  return value;
}

async function live(id) {
  const r = await fetch(`${API}/${id}`, { headers: { 'xi-api-key': KEY } });
  if (!r.ok) throw new Error(`ElevenLabs GET ${r.status}`);
  return r.json();
}

function snapshot(d) {
  const a = d.conversation_config?.agent ?? {};
  const p = a.prompt ?? {};
  return {
    prompt: p.prompt ?? '',
    firstMessage: a.first_message ?? '',
    meta: redact({
      name: d.name,
      language: a.language,
      llm: p.llm,
      tts_model: d.conversation_config?.tts?.model_id,
      voice_id: d.conversation_config?.tts?.voice_id,
      temperature: p.temperature,
      tools: (p.tools ?? []).map((t) => ({ name: t.name, description: t.description, api_schema: t.api_schema })),
      post_call_webhook: d.platform_settings?.workspace_overrides?.webhooks ?? null,
    }),
  };
}

const files = (name) => ({
  prompt: path.join(ROOT, name, 'prompt.md'),
  firstMessage: path.join(ROOT, name, 'first-message.txt'),
  meta: path.join(ROOT, name, 'agent.json'),
});

function readRepo(name) {
  const f = files(name);
  return {
    prompt: fs.readFileSync(f.prompt, 'utf8'),
    firstMessage: fs.readFileSync(f.firstMessage, 'utf8'),
    meta: JSON.parse(fs.readFileSync(f.meta, 'utf8')),
  };
}

function diff(repo, now) {
  const out = [];
  if (repo.prompt !== now.prompt) out.push('prompt');
  if (repo.firstMessage !== now.firstMessage) out.push('first message');
  if (JSON.stringify(repo.meta) !== JSON.stringify(now.meta)) out.push('settings/tools (not pushed automatically)');
  return out;
}

async function main() {
  const cmd = process.argv[2];
  if (!KEY || !['pull', 'check', 'push'].includes(cmd)) {
    console.error('usage: ELEVENLABS_API_KEY=... node scripts/agents.mjs pull|check|push');
    process.exit(2);
  }
  let drift = false;
  for (const [name, id] of Object.entries(AGENTS)) {
    if (!id) { console.log(`${name}: agent id not configured, skipped`); continue; }
    const now = snapshot(await live(id));
    if (cmd === 'pull') {
      const f = files(name);
      fs.mkdirSync(path.dirname(f.prompt), { recursive: true });
      fs.writeFileSync(f.prompt, now.prompt);
      fs.writeFileSync(f.firstMessage, now.firstMessage);
      fs.writeFileSync(f.meta, JSON.stringify(now.meta, null, 2) + '\n');
      console.log(`${name}: saved`);
      continue;
    }
    const repo = readRepo(name);
    const changes = diff(repo, now);
    if (cmd === 'check') {
      console.log(`${name}: ${changes.length ? 'DRIFT in ' + changes.join(', ') : 'in sync'}`);
      if (changes.length) drift = true;
      continue;
    }
    // push: prompt + first message only
    const patch = { conversation_config: { agent: {} } };
    if (repo.prompt !== now.prompt) patch.conversation_config.agent.prompt = { prompt: repo.prompt };
    if (repo.firstMessage !== now.firstMessage) patch.conversation_config.agent.first_message = repo.firstMessage;
    if (!Object.keys(patch.conversation_config.agent).length) { console.log(`${name}: nothing to push`); continue; }
    const r = await fetch(`${API}/${id}`, {
      method: 'PATCH', headers: { 'xi-api-key': KEY, 'content-type': 'application/json' }, body: JSON.stringify(patch),
    });
    if (!r.ok) throw new Error(`${name}: ElevenLabs PATCH ${r.status} ${await r.text()}`);
    const after = diff(repo, snapshot(await live(id))).filter((c) => c !== 'settings/tools (not pushed automatically)');
    if (after.length) throw new Error(`${name}: push not reflected live (${after.join(', ')})`);
    console.log(`${name}: pushed ${Object.keys(patch.conversation_config.agent).join(' + ')}`);
  }
  if (drift) process.exit(1);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
