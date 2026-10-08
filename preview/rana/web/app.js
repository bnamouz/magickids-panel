const route = '__PORT_4317__';
const API = route.startsWith('__') ? '' : route;
const $ = s => document.querySelector(s);
const time = iso => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
const dateLabel = day => new Intl.DateTimeFormat('he-IL-u-nu-latn', { timeZone: 'Asia/Jerusalem', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(day + 'T12:00:00Z'));
const monthLabel = day => new Intl.DateTimeFormat('he-IL-u-nu-latn', { month: 'short', timeZone: 'Asia/Jerusalem' }).format(new Date(day + 'T12:00:00Z'));
const weekday = day => new Intl.DateTimeFormat('he-IL', { weekday: 'short', timeZone: 'Asia/Jerusalem' }).format(new Date(day + 'T12:00:00Z'));
const range = s => `<bdi>${time(s.start)}–${time(s.end)}</bdi>`;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// getRandomValues also works in an opaque-origin iframe where randomUUID may
// not be exposed. This is an idempotency identifier, never an auth credential.
const newId = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const h = [...bytes].map(b => b.toString(16).padStart(2,'0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
};
const labels = { pending: 'ממתינה לאישור רנא', confirmed: 'אושר בסביבת הבדיקה', rejected: 'הבקשה נדחתה', expired: 'תוקף הבקשה הסתיים' };
const errors = {
  slot_unavailable: 'השעה אינה זמינה כעת, או שהזמינות השתנתה. רעננו ובחרו שעה אחרת.',
  demo_calendar_failure: 'הודמה כשל ביומן. הבקשה נשארה ממתינה ולא נוצר אישור. כבו את הדמיית התקלה ונסו שוב.',
  invalid_availability: 'בדקו את השעות: כל טווח צריך להתחלק בשלמות במשך הטיפול, ללא שעות חסרות או תאריך לא תקין.',
  overlapping_windows: 'יש חפיפה בין טווחי עבודה באותו יום. תקנו אותה לפני השמירה.',
  request_not_pending: 'הבקשה כבר טופלה או פג תוקפה. יש לרענן את הרשימה.',
  stale_settings: 'השעות עודכנו במקום אחר. רעננו לפני ביצוע שינוי נוסף.',
  unauthorized: 'הגישה לבדיקה פגה. רעננו את העמוד.',
  too_many_requests: 'יש יותר מדי בקשות בדיקה ממתינות. טפלו בחלק מהן לפני יצירת נוספות.',
};
let auth, view = 'parent', slots = [], mine = [], staff, selectedDay = '', selected = null, draft, busy = false, failure = false, family = 'משפחת בדיקה א', idem = newId();
function notice(text = '', error = false) {
  $('#notice').textContent = text; $('#notice').hidden = !text;
  $('#notice').classList.toggle('error', error);
}
async function api(path, body, role = 'parent') {
  const r = await fetch(API + '/api/' + path, {
    method: body ? 'POST' : 'GET', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(auth ? { 'X-Demo-Key': role === 'staff' ? auth.demoStaffKey : auth.parentKey } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(errors[d.error] || 'לא ניתן להשלים כרגע. נסו לרענן ולנסות שוב.');
  return d;
}
async function refresh() {
  if (view === 'parent') {
    const data = await Promise.all([api('slots'), api('mine')]);
    slots = data[0].slots; mine = data[1];
    const days = [...new Set(slots.map(s => s.day))];
    if (!days.includes(selectedDay)) selectedDay = days[0] || '';
    if (selected && !slots.some(s => s.start === selected.start)) selected = null;
  } else {
    staff = await api('staff', null, 'staff');
    draft = structuredClone(staff.availability);
  }
  render();
}
async function act(work) {
  if (busy) return;
  busy = true; document.querySelectorAll('button').forEach(b => b.disabled = true);
  try { await work(); } catch (e) { notice(e.message, true); }
  finally { busy = false; document.querySelectorAll('button').forEach(b => b.disabled = false); if (view === 'parent' && !selected && $('#submit-request')) $('#submit-request').disabled = true; }
}
function requestMarkup(r, actions = false) {
  return `<article class="request"><div><p><strong>${esc(r.family)}</strong></p><p>${dateLabel(r.start.slice(0, 10))} · ${range(r)} · ${r.duration} דקות</p><span class="badge ${r.status}">${labels[r.status]}</span>${r.status === 'confirmed' ? '<p class="fine">אירוע מדומה בלבד. לא נוצר תור ב־Google ולא נשלחה הודעה.</p>' : ''}${r.status === 'pending' ? `<p class="fine">הבקשה מוחזקת עד ${dateLabel(r.expires.slice(0,10))}, ${time(r.expires)}. טרם אושרה.</p>` : ''}</div>${actions && r.status === 'pending' ? `<div class="request-actions"><button class="primary" data-approve="${r.id}">אישור הבקשה</button><button data-reject="${r.id}">דחייה</button></div>` : ''}</article>`;
}
function parentHTML() {
  const days = [...new Set(slots.map(s => s.day))];
  return `<div class="booking-layout"><section class="panel" aria-label="בחירת מועד"><div class="panel-top"><h2>בחרו יום ושעה</h2><span class="badge">שעון ישראל</span></div><p class="muted">מוצגים רק מועדים פנויים ב־28 הימים הקרובים.</p>
    ${days.length ? `<div class="dates">${days.map(d => `<button class="date ${selectedDay === d ? 'selected' : ''}" data-day="${d}" aria-pressed="${selectedDay === d}" aria-label="${dateLabel(d)}"><span>${weekday(d)}</span><strong>${Number(d.slice(8))}</strong><span>${monthLabel(d)}</span></button>`).join('')}</div><div class="panel-top"><strong>${dateLabel(selectedDay)}</strong><span class="muted">${slots.filter(s => s.day === selectedDay).length} שעות פנויות</span></div><div class="slots">${slots.filter(s => s.day === selectedDay).map(s => `<button data-slot="${s.start}" class="slot ${selected?.start === s.start ? 'selected' : ''}" aria-pressed="${selected?.start === s.start}">${range(s)}<span class="duration">${s.duration} דקות</span></button>`).join('')}</div>` : '<div class="empty"><strong>אין כרגע שעות פנויות</strong>אפשר לבדוק שוב בהמשך או לשנות זמינות בתצוגת רנא.</div>'}
    <div class="process"><strong>1 · בחירת מועד</strong><span>←</span><span>2 · שליחת בקשה</span><span>←</span><span>3 · אישור רנא</span></div></section>
    <section class="panel" aria-label="סיכום בקשה"><p class="eyebrow">הבקשה שלכם</p><h2>טיפול רגשי עם רנא</h2><p class="muted">רנא שלח דור</p><div class="selection">${selected ? `<strong>${dateLabel(selected.day)}</strong>${range(selected)}<p>משך המפגש: ${selected.duration} דקות</p>` : '<strong>עוד לא נבחרה שעה</strong><p>בחרו מועד פנוי ביומן כדי להמשיך.</p>'}</div>
    <div id="request-form"><label for="family">משפחת הדגמה</label><select id="family">${['משפחת בדיקה א','משפחת בדיקה ב','משפחת בדיקה ג'].map(f => `<option ${f === family ? 'selected' : ''}>${f}</option>`).join('')}</select><button type="button" id="submit-request" class="primary full" ${!selected ? 'disabled' : ''}>שליחת בקשת בדיקה לרנא</button></div><p class="fine">הבקשה תופיע כאן במסך רנא, ללא הודעה אמיתית. אין להזין פרטים של מטופלים.</p></section></div>
    <section class="panel my-requests"><div class="panel-top"><h2>הבקשות שלי בבדיקה</h2><span class="muted">${mine.length} בקשות</span></div>${mine.length ? mine.map(r => requestMarkup(r)).join('') : '<div class="empty"><strong>הבקשה הראשונה תופיע כאן</strong>לאחר השליחה תוכלו לעקוב כאן אם היא ממתינה, אושרה או נדחתה.</div>'}</section>`;
}
function staffHTML() {
  const pending = staff.requests.filter(r => r.status === 'pending');
  const past = staff.requests.filter(r => r.status !== 'pending');
  return `<div class="staff-summary"><div class="metric"><strong>${pending.length}</strong><span>ממתינות להחלטה</span></div><div class="metric"><strong>${staff.requests.filter(r => r.status === 'confirmed').length}</strong><span>אושרו בבדיקה</span></div><div class="metric"><strong>${staff.events}</strong><span>אירועים מדומים</span></div></div><section class="panel"><div class="toolbar"><h2>בקשות חדשות</h2><label class="toggle"><input type="checkbox" id="failure" ${failure ? 'checked' : ''}>הדמיית כשל בסנכרון היומן</label></div><p class="muted">אפשר לאשר או לדחות כל בקשה. לפני האישור נבדקת שוב הזמינות.</p>${pending.length ? pending.map(r => requestMarkup(r, true)).join('') : '<div class="empty"><strong>אין בקשות שממתינות להחלטה</strong>עברו לתצוגת ההורים ושלחו בקשת בדיקה ראשונה.</div>'}</section><section class="panel my-requests"><h2>בקשות שטופלו</h2>${past.length ? past.map(r => requestMarkup(r)).join('') : '<p class="muted">בקשות מאושרות, דחויות או שפג תוקפן יופיעו כאן.</p>'}</section>`;
}
const minuteLabel = n => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
const minutes = str => {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(str)) return NaN;
  const p = str.split(':').map(Number); return p[0] * 60 + p[1];
};
function settingsHTML() {
  return `<section class="panel"><h2>שעות קבלת קהל</h2><p class="muted">כל טווח מתחלק לטיפולים רצופים לפי המשך שנבחר. שינוי השעות אינו מבטל תורים שכבר אושרו.</p><div id="windows">${draft.windows.map((w,i) => `<div class="window-row" data-window="${i}"><label>יום<select data-field="day">${['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'].map((d,n) => `<option value="${n}" ${w.day === n ? 'selected' : ''}>${d}</option>`).join('')}</select></label><label>משעה<input type="text" dir="ltr" maxlength="5" placeholder="08:30" data-field="start" value="${minuteLabel(w.start)}" required></label><label>עד שעה<input type="text" dir="ltr" maxlength="5" placeholder="15:00" data-field="end" value="${minuteLabel(w.end)}" required></label><label>משך טיפול<select data-field="duration">${[30,45,60,90].map(n => `<option value="${n}" ${w.duration === n ? 'selected' : ''}>${n} דקות</option>`).join('')}</select></label><button data-remove="${i}" aria-label="הסרת טווח ${i+1}">הסרה</button></div>`).join('') || '<p class="muted">אין טווחים פעילים. הוסיפו טווח כדי לפתוח שעות להורים.</p>'}</div><div class="settings-actions"><button id="add-window">הוספת טווח</button><button id="default-windows">שחזור שעות שישי בטיוטה</button></div>
    <div class="closed-dates"><h3>ימים ללא קבלת קהל</h3><p class="muted">חסימת יום מסירה את השעות הפנויות שלו. בקשות ממתינות באותו יום יידרשו לדחייה או לתיאום מחדש; תורים מאושרים אינם נמחקים.</p><div class="date-add"><label for="closed-date">תאריך לחסימה<input id="closed-date" type="date"></label><button id="add-closed">הוספה</button></div><div class="chips">${draft.closedDates.map(d => `<button data-open-date="${d}" aria-label="ביטול חסימת ${d}"><bdi>${d}</bdi> ×</button>`).join('')}</div></div>
    <div class="settings-actions"><button class="primary" id="save-settings">שמירת זמינות בסביבת הבדיקה</button></div><p class="fine">שינויים ייכנסו לתוקף רק לאחר שמירה. בקשה ממתינה שאינה מתאימה לזמינות החדשה לא תאושר אוטומטית.</p></section><section class="panel my-requests"><h2>חיבור היומן</h2><p><span class="badge pending">Google לא מחובר בסביבת הבדיקה</span></p><p class="muted">הגדרת היומן של רנא נשמרה בקוד ההכנה, אך הרשאות הגישה לא אומתו כאן. אין שימוש ביומן הקשב או ביומן מרפאת הילדים כחלופה.</p></section>`;
}
function collectDraft() {
  draft.windows = [...document.querySelectorAll('[data-window]')].map(row => {
    const v = name => row.querySelector(`[data-field="${name}"]`).value;
    return { day: Number(v('day')), start: minutes(v('start')), end: minutes(v('end')), duration: Number(v('duration')) };
  });
}
function render() {
  document.querySelectorAll('[data-view]').forEach(b => { b.classList.toggle('active', b.dataset.view === view); b.setAttribute('aria-current', b.dataset.view === view ? 'page' : 'false'); });
  $('#page-title').textContent = view === 'parent' ? 'נמצא זמן שמתאים לכם' : view === 'staff' ? 'שלום רנא, אלה הבקשות שלך' : 'היומן שלך, בקצב שלך';
  $('#page-subtitle').textContent = view === 'parent' ? 'בחרו שעה פנויה ושלחו בקשה. התור ייקבע רק לאחר האישור של רנא.' : view === 'staff' ? 'כל הבקשות כאן הן לבדיקה. אפשר להתנסות באישור, בדחייה ובכשל בסנכרון.' : 'קבעי ימים, שעות ומשך טיפול. ההורים יראו רק את המועדים הזמינים.';
  $('#app').innerHTML = view === 'parent' ? parentHTML() : view === 'staff' ? staffHTML() : settingsHTML();
  document.querySelectorAll('[data-day]').forEach(b => b.onclick = () => { selectedDay = b.dataset.day; selected = null; render(); });
  document.querySelectorAll('[data-slot]').forEach(b => b.onclick = () => { selected = slots.find(s => s.start === b.dataset.slot); idem = newId(); render(); });
  if ($('#family')) $('#family').onchange = e => { family = e.target.value; idem = newId(); };
  if ($('#submit-request')) $('#submit-request').onclick = () => { if (!selected) return; void act(async () => {
    await api('request', { start: selected.start, family, idem }); selected = null; idem = newId();
    await refresh(); notice('בקשת הבדיקה נשמרה וממתינה לאישור רנא. עברו ל״הבקשות של רנא״ כדי לבדוק אישור או דחייה.');
  }); };
  if ($('#failure')) $('#failure').onchange = e => { failure = e.target.checked; };
  document.querySelectorAll('[data-approve],[data-reject]').forEach(b => b.onclick = () => void act(async () => {
    const approve = !!b.dataset.approve;
    await api('decision', { id: b.dataset.approve || b.dataset.reject, action: approve ? 'approve' : 'reject', simulateFailure: failure }, 'staff');
    await refresh(); notice(approve ? 'הבקשה אושרה ונוצר אירוע מדומה בלבד. לא נשלחה הודעה ולא נוצר תור ב־Google.' : 'הבקשה נדחתה והשעה שוחררה לבחירה מחדש.');
  }));
  if ($('#add-window')) $('#add-window').onclick = () => { collectDraft(); draft.windows.push({ day: 1, start: 960, end: 1080, duration: 60 }); render(); };
  document.querySelectorAll('[data-remove]').forEach(b => b.onclick = () => { collectDraft(); draft.windows.splice(Number(b.dataset.remove), 1); render(); });
  if ($('#default-windows')) $('#default-windows').onclick = () => { draft.windows = [{ day:5,start:510,end:810,duration:60 },{ day:5,start:810,end:900,duration:45 }]; render(); notice('שעות שישי שוחזרו בטיוטה. לחצו על שמירה כדי להחיל.'); };
  if ($('#add-closed')) $('#add-closed').onclick = () => { collectDraft(); const d = $('#closed-date').value; if (!d) { notice('בחרו תאריך לחסימה.', true); return; } draft.closedDates = [...new Set([...draft.closedDates, d])]; render(); };
  document.querySelectorAll('[data-open-date]').forEach(b => b.onclick = () => { collectDraft(); draft.closedDates = draft.closedDates.filter(d => d !== b.dataset.openDate); render(); });
  if ($('#save-settings')) $('#save-settings').onclick = () => void act(async () => { collectDraft(); await api('availability', { availability: draft, version: staff.version }, 'staff'); await refresh(); notice('הזמינות נשמרה בסביבת הבדיקה. תורים שכבר אושרו נשמרו ללא שינוי.'); });
}
document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => void act(async () => { view = b.dataset.view; notice(); await refresh(); }));
$('#refresh').onclick = () => void act(async () => { await refresh(); notice('התצוגה עודכנה.'); });
$('#theme').onclick = () => {
  const dark = document.documentElement.dataset.theme !== 'dark'; document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('#theme').textContent = dark ? 'תצוגה בהירה' : 'תצוגה כהה';
};
try { auth = await api('bootstrap'); await refresh(); }
catch (e) { $('#app').innerHTML = '<div class="panel"><h2>לא הצלחנו לטעון את היומן</h2><p>ייתכן שסביבת הבדיקה אינה זמינה כרגע. נסו לטעון מחדש את העמוד.</p><button onclick="location.reload()">טעינה מחדש</button></div>'; notice(e.message, true); }
