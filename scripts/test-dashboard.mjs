import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url), root = path.resolve(import.meta.dirname, '..');
function compile(relative, overrides = {}) {
  const filename = path.join(root, relative);
  const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', js)(name => {
    if (name in overrides) return overrides[name];
    if (name.startsWith('@/') || name.startsWith('./')) {
      const base = name.startsWith('@/') ? name.slice(2) : path.relative(root, path.resolve(path.dirname(filename), name));
      const ext = ['.ts', '.tsx', '/index.ts'].find(ext => fs.existsSync(path.join(root, base + ext)));
      return compile(base + ext, overrides);
    }
    return require(name);
  }, module, module.exports);
  return module.exports;
}
const parent = compile('questions/vanderbilt_parent.ts').VANDERBILT_PARENT_QUESTIONS;
const teacher = compile('questions/vanderbilt_teacher.ts').VANDERBILT_TEACHER_QUESTIONS;
const forms = [parent, teacher].map((questions, i) => ({
  type: i ? 'vanderbilt_teacher' : 'vanderbilt_parent',
  is_complete: true, submitted_at: '2026-09-01T10:00:00Z',
  responses: Object.fromEntries(questions.map(q => [q.id, q.section === 'A' ? 0 : 1])),
}));
const sessions = Array.from({ length: 205 }, (_, i) => ({
  id: `synthetic-${i}`, status: i === 204 ? 'reported' : i === 203 ? 'closed' : i === 202 ? 'cancelled' : 'created',
  created_at: '2026-08-01T00:00:00Z',
  patients: i === 204 ? [{ first_name: 'ילד', last_name: 'בדיקת ארכיון' }] : { first_name: `ילד ${i}`, last_name: 'בדיקה' },
  parents: [{ full_name: 'הורה בדיקה', phone: '' }],
  questionnaires: forms, appointments: [],
}));
function db({ fail = false } = {}) {
  return { from(table) {
    assert.equal(table, 'intake_sessions');
    let exclude = false;
    const q = {
      select() { return q; }, order() { return q; },
      not(column, op, value) {
        assert.deepEqual([column, op, value], ['status', 'in', '(closed,cancelled,reported)']);
        exclude = true; return q;
      },
      range(start, end) { q.bounds = [start, end]; return q; },
      then(resolve, reject) {
        const rows = exclude ? sessions.filter(s => !['closed', 'cancelled', 'reported'].includes(s.status)) : sessions;
        return Promise.resolve(fail ? { data: null, error: new Error('unavailable') } :
          { data: rows.slice(q.bounds[0], q.bounds[1] + 1), error: null }).then(resolve, reject);
      },
    };
    return q;
  } };
}
const { loadIntakeQueue } = compile('lib/intake/queue.ts', { '@/lib/supabase': { getSupabaseAdmin: () => db() } });
const { caseDirectory } = compile('lib/intake/directory.ts');
const link = ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children);
const CaseDirectory = compile('components/admin/CaseDirectory.tsx', { 'next/link': { default: link, __esModule: true } }).default;

test('dashboard includes archived records beyond page 200 without reopening scheduling', async () => {
  const active = await loadIntakeQueue(), all = await loadIntakeQueue({ includeArchived: true });
  assert.equal(active.length, 202);
  assert.equal(all.length, 205);
  assert.equal(active.some(row => row.id === 'synthetic-204'), false);
  const archive = all.find(row => row.id === 'synthetic-204');
  assert.equal(archive.childName, 'ילד בדיקת ארכיון');
  assert.equal(archive.parentComplete, true);
  assert.equal(archive.readyToSchedule, false);
  assert.equal(archive.stage, 'closed');
  const result = caseDirectory(all, '  ארכיון  ');
  assert.equal(result.total, 1);
  const html = renderToStaticMarkup(React.createElement(CaseDirectory, { result }));
  assert.ok(html.includes('הופק דוח'));
  assert.ok(html.includes('/admin/sessions/synthetic-204#questionnaires'));
  assert.ok(html.includes('הושלם ונשלח'));
});
test('search, submission ordering, stable paging, missing matches and page bounds', async () => {
  const all = await loadIntakeQueue({ includeArchived: true });
  assert.equal(caseDirectory(all, 'הורה בדיקה').total, 205);
  assert.equal(caseDirectory(all, 'אין שם כזה').total, 0);
  assert.equal(caseDirectory(all, '', '2').rows.length, 10);
  assert.equal(caseDirectory(all, '', '-1').page, 1);
  assert.equal(caseDirectory(all, '', 'nope').page, 1);
  assert.equal(caseDirectory(all, '', '999').page, 21);
  assert.equal(caseDirectory(all, '', '999').rows.length, 5);
  const newest = { ...all[0], id: 'latest', parentSubmittedAt: '2026-09-25T20:00:00Z' };
  assert.equal(caseDirectory([...all, newest]).rows[0].id, 'latest');
  const html = renderToStaticMarkup(React.createElement(CaseDirectory, { result: caseDirectory(all, 'הורה', '2') }));
  assert.match(html, /page=3/);
  assert.match(html, /q=/);
  assert.ok(!html.includes('responses'));
});
test('database errors remain visible, not empty success', async () => {
  const broken = compile('lib/intake/queue.ts', { '@/lib/supabase': { getSupabaseAdmin: () => db({ fail: true }) } });
  await assert.rejects(broken.loadIntakeQueue({ includeArchived: true }), /intake_queue_unavailable/);
  const html = renderToStaticMarkup(React.createElement(CaseDirectory, { result: null }));
  assert.ok(html.includes('role="alert"'));
});
test('dashboard authenticates before fetching data and keeps archived cases out of active counts', async () => {
  const all = await loadIntakeQueue({ includeArchived: true });
  const overrides = {
    'next/link': { default: link, __esModule: true },
    '@/lib/intake/queue': { loadIntakeQueue: async options => { assert.equal(options.includeArchived, true); return all; } },
    '@/lib/supabase': { getSupabaseAdmin: () => ({ from: () => ({ select: () => ({ limit: async () => ({ data: [] }) }) }) }) },
    '@/lib/admin/auth': { requireStaff: async () => ({ full_name: 'צוות בדיקה' }) },
  };
  const Dashboard = compile('app/admin/dashboard/page.tsx', overrides).default;
  const html = renderToStaticMarkup(await Dashboard({ searchParams: { q: 'ארכיון' } }));
  assert.ok(html.includes('ילד בדיקת ארכיון'));
  assert.ok(html.includes('>202<'));
  const readyPanel = html.slice(html.indexOf('<h2 class="font-bold text-slate-800">מוכנים לזימון לפגישה'));
  assert.ok(!readyPanel.includes('ילד בדיקת ארכיון'));
  let fetched = false;
  const denied = compile('app/admin/dashboard/page.tsx', {
    ...overrides,
    '@/lib/admin/auth': { requireStaff: async () => { throw new Error('UNAUTHORIZED'); } },
    '@/lib/intake/queue': { loadIntakeQueue: async () => { fetched = true; return all; } },
  }).default;
  await assert.rejects(denied({}), /UNAUTHORIZED/);
  assert.equal(fetched, false);
});
