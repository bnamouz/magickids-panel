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
    if(name==='next/navigation')return {useRouter:()=>({refresh(){}})};
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
    '@/components/admin/CalendarOverview': {default:()=>null,__esModule:true},
    '@/lib/intake/dashboard-archive': {loadDashboardArchive:async()=>new Set()},
    '@/lib/intake/queue': { loadIntakeQueue: async options => { assert.equal(options.includeArchived, true); return all; } },
    '@/lib/supabase': { getSupabaseAdmin: () => ({ from: () => ({ select: () => ({ in() { return this; }, order() { return this; }, limit: async () => ({ data: [], count: 0 }) }) }) }) },
    '@/lib/admin/auth': { requireStaff: async () => ({ full_name: 'צוות בדיקה' }) },
  };
  const Dashboard = compile('app/admin/dashboard/page.tsx', overrides).default;
  const html = renderToStaticMarkup(await Dashboard({ searchParams: { q: 'ארכיון' } }));
  assert.ok(html.includes('ילד בדיקת ארכיון'));
  assert.ok(html.includes('>202<'));
  const queueStart = html.indexOf('data-region="work-queue"'), queueEnd = html.indexOf('data-region="case-directory"');
  assert.ok(queueStart > 0 && queueEnd > queueStart);
  const workQueue = html.slice(queueStart, queueEnd);
  assert.ok(workQueue.includes('מוכן לזימון'));
  assert.ok(!workQueue.includes('ילד בדיקת ארכיון'));
  const WithArchive=compile('app/admin/dashboard/page.tsx',{...overrides,'@/lib/intake/dashboard-archive':{loadDashboardArchive:async()=>new Set(['synthetic-204'])}}).default;
  const visible=renderToStaticMarkup(await WithArchive({searchParams:{q:'ארכיון'}}));
  assert.ok(!visible.includes('ילד בדיקת ארכיון'));
  const hidden=renderToStaticMarkup(await WithArchive({searchParams:{q:'ארכיון',archive:'1'}}));
  assert.ok(hidden.includes('ילד בדיקת ארכיון'));assert.ok(hidden.includes('שחזור לרשימה'));assert.ok(hidden.includes('/edit'));
  let fetched = false;
  const denied = compile('app/admin/dashboard/page.tsx', {
    ...overrides,
    '@/lib/admin/auth': { requireStaff: async () => { throw new Error('UNAUTHORIZED'); } },
    '@/lib/intake/queue': { loadIntakeQueue: async () => { fetched = true; return all; } },
  }).default;
  await assert.rejects(denied({}), /UNAUTHORIZED/);
  assert.equal(fetched, false);
});

test('dashboard distinguishes failed data from empty queues and sorts appointments', async () => {
  let ordered = false;
  const Dashboard = compile('app/admin/dashboard/page.tsx', {
    'next/link': { default: link, __esModule: true },
    '@/components/admin/CalendarOverview': {default:()=>null,__esModule:true},
    '@/lib/intake/dashboard-archive': {loadDashboardArchive:async()=>new Set()},
    '@/lib/admin/auth': { requireStaff: async () => ({ full_name: 'צוות בדיקה' }) },
    '@/lib/intake/queue': { loadIntakeQueue: async () => { throw new Error('unavailable'); } },
    '@/lib/supabase': { getSupabaseAdmin: () => ({ from: table => ({
      select() { return this; }, in() { return this; },
      order(column, options) { if(table === 'v_today_appointments') { assert.equal(column, 'scheduled_at'); assert.equal(options.ascending, true); ordered = true; } return this; },
      limit: async () => ({ data: null, count: null, error: { message: 'unavailable' } }),
    }) }) },
  }).default;
  const html = renderToStaticMarkup(await Dashboard({}));
  assert.equal(ordered, true);
  assert.ok(html.includes('לא ניתן לטעון את פגישות היום'));
  assert.ok(html.includes('לא ניתן לטעון את הפניות לטיפול'));
  assert.ok(html.includes('לא ניתן לטעון את התיקים שדורשים טיפול'));
  assert.ok(html.includes('לא ניתן לטעון את השיחות'));
  assert.ok(html.includes('לא ניתן לטעון את רשימת הממתינים לזימון'));
  assert.ok(html.includes('לא ניתן לטעון את היומן המאוחד'));
  assert.ok(html.includes('נתונים חלקיים'));
  assert.ok(!html.includes('אין פגישות מכון מתוזמנות היום'));
  assert.ok(!html.includes('אין פניות שממתינות לתיאום'));
  assert.ok(!html.includes('אין כרגע פריטים שממתינים לטיפול'));
  assert.ok(!html.includes('אין תורים עתידיים'));
});

test('daily overview merges every source into one work queue and keeps each action', async () => {
  const session = id => ({ id, status: 'created', createdAt: '2026-08-01T00:00:00Z', childName: 'ילד ' + id, parentName: 'הורה', stage: id === 'r1' ? 'ready' : 'parent', readyToSchedule: id === 'r1' });
  const soon = new Date(Date.now() + 60_000).toISOString();
  const tables = {
    v_stuck_sessions: { data: [{ id: 's1', child_name: 'ילד תקוע', status: 'created', days_stuck: 9 }, { id: 'hidden-1', child_name: 'ילד מוסתר', status: 'created', days_stuck: 30 }] },
    v_today_appointments: { data: [] },
    treatment_requests: { data: [{ id: 't1', patient_name: 'ילד פנייה', contact_name: 'הורה פנייה', status: 'pending', created_at: soon }], count: 7 },
  };
  const overrides = {
    'next/link': { default: link, __esModule: true },
    '@/components/admin/CalendarOverview': { default: ({ data }) => { assert.equal(data.rows.length, 2); return null; }, __esModule: true },
    '@/lib/intake/dashboard-archive': { loadDashboardArchive: async () => new Set(['hidden-1']) },
    '@/lib/intake/queue': { loadIntakeQueue: async () => [session('r1'), session('p1')] },
    '@/lib/voice/follow-up': { loadCallFollowUps: async () => [{ id: 'c1', created_at: soon, call_started_at: soon, caller_name: 'מתקשר', child_name: null, next_action: 'לחזור להורה', purpose: null, linked_case_id: 'r1', reason: 'הסלמה לצוות' }] },
    '@/lib/calendar-agenda': { loadCalendarAgenda: async () => ({ rows: [
      { key: 'a', start: soon, end: soon, name: 'תור קרוב', service: 'אבחון קשב', href: '/admin/sessions/r1', state: 'synced', eventKey: null },
      { key: 'b', start: '2099-01-01T10:00:00Z', end: '2099-01-01T11:00:00Z', name: 'תור רחוק', service: 'MOXO', href: '/admin/moxo', state: 'pending', eventKey: null }], health: null, truncated: false }) },
    '@/lib/supabase': { getSupabaseAdmin: () => ({ from: table => ({ select() { return this; }, in() { return this; }, order() { return this; }, limit: async () => tables[table] }) }) },
    '@/lib/admin/auth': { requireStaff: async () => ({ full_name: 'צוות בדיקה', role: 'assistant' }) },
  };
  const Dashboard = compile('app/admin/dashboard/page.tsx', overrides).default;
  const html = renderToStaticMarkup(await Dashboard({}));
  const queue = html.slice(html.indexOf('data-region="work-queue"'), html.indexOf('aria-labelledby="agenda-title"'));
  // Order: call, treatment request, ready case, stuck case. The first item is the single highlighted one.
  const order = ['מתקשר', 'ילד פנייה', 'ילד r1', 'ילד תקוע'].map(name => queue.indexOf(name));
  assert.ok(order.every((at, i) => at > 0 && (i === 0 || at > order[i - 1])), String(order));
  assert.equal(queue.split('data-priority="true"').length - 1, 1);
  assert.ok(!queue.includes('ילד מוסתר'));
  for (const href of ['/admin/calls/c1', '/admin/sessions/r1#calls', '/admin/treatments', '/admin/sessions/r1#appointments', '/admin/sessions/r1"', '/admin/sessions/s1', '/admin/calls"', '/admin/intake?stage=ready', '/admin/sessions?filter=stuck', '/admin/treatments?status=closed'])
    assert.ok(queue.includes(`href="${href.replace(/"$/, '')}${href.endsWith('"') ? '"' : ''}`), href);
  assert.ok(queue.includes('טופל'));
  assert.ok(queue.includes('מוצגות 1 הפניות האחרונות מתוך 7'));
  // True totals: 1 call + 7 requests + 2 cases.
  assert.ok(queue.includes('>10<'));
  assert.ok(html.includes('הקרוב ב־'));
  assert.ok(html.includes('תור רחוק') && html.includes('ממתין לאישור או לסנכרון'));
  for (const href of ['/admin/pediatrics-calendar', '/admin/clinic-hours', '/admin/pediatrics-calendar#doctor-requests', '/admin/adhd-requests', '/admin/leads', '/admin/intake', '/onboarding/public', '/admin/intake?stage=all', '/admin/intake?stage=parent', '/admin/intake?stage=teacher', '/admin/appointments'])
    assert.ok(html.includes(`href="${href}"`), href);
  assert.ok(html.includes('action="/admin/dashboard#case-directory"') && html.includes('name="q"'));
  assert.ok(html.includes('רענון נתונים'));
});

test('staff navigation keeps every destination available with current-page semantics and mobile toggle', () => {
  const Navigation = compile('components/admin/AdminNavigation.tsx', {
    'next/link': { default: link, __esModule: true },
    '@/components/admin/CalendarOverview': {default:()=>null,__esModule:true},
    '@/lib/intake/dashboard-archive': {loadDashboardArchive:async()=>new Set()},
    'next/navigation': { usePathname: () => '/admin/sessions/example' },
  }).default;
  const html = renderToStaticMarkup(React.createElement(Navigation));
  assert.match(html, /href="\/admin\/sessions" aria-current="page"/);
  assert.match(html, /aria-controls="staff-navigation"/);
  assert.match(html, /id="staff-navigation"/);
  assert.match(html, /aria-expanded="true" aria-controls="staff-folder-patients"/);
  assert.equal(html.split('aria-current="page"').length - 1, 1);
  assert.ok(html.includes('href="/admin/dashboard"'));
  for (const route of ['pediatrics-calendar','clinic-patients','clinic-hours','intake','sessions','appointments','moxo','adhd-payments','adhd-requests','treatments','therapists','therapy','recruitment','development','classes','abroad','reviews','leads','secretaries','calls','personal/calls','google-calendars','system-health']) {
    assert.equal(html.split(`href="/admin/${route}"`).length - 1, 1, route);
    assert.ok(html.includes(`href="/admin/${route}"`), route);
    assert.ok(fs.existsSync(path.join(root, 'app/admin', route, 'page.tsx')), route);
  }
  assert.ok(fs.existsSync(path.join(root, 'app/admin/rana/page.tsx')), 'legacy Rana destination remains available');
});

test('unified calendar presents sync problems and never reports a failed load as an empty calendar',async()=>{
 const overrides={
  'next/link':{default:link,__esModule:true},
  './CalendarSyncButton':{default:()=>null,__esModule:true},
  '@/lib/calendar-agenda':{loadCalendarAgenda:async()=>({rows:[{key:'t',start:'2099-01-01T10:00:00Z',name:'Synthetic',service:'טיפול',state:'failed',href:'/admin/treatments'}],health:{last_run:new Date().toISOString(),details:{failed:1}},truncated:false})},
 };
 const Overview=compile('components/admin/CalendarOverview.tsx',overrides).default;
 const html=renderToStaticMarkup(await Overview({}));
 assert.ok(html.includes('הסנכרון נכשל'));assert.ok(html.includes('role="alert"'));assert.ok(html.includes('Synthetic'));
 const Broken=compile('components/admin/CalendarOverview.tsx',{...overrides,'@/lib/calendar-agenda':{loadCalendarAgenda:async()=>{throw Error('unavailable');}}}).default;
 const broken=renderToStaticMarkup(await Broken({}));assert.ok(broken.includes('לא ניתן לטעון'));assert.ok(!broken.includes('אין תורים עתידיים'));
});
