'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

export default function PasswordForm({ reset = false }: { reset?: boolean }) {
  const [client] = useState(() => createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [ready, setReady] = useState(!reset);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!reset) return;
    let active = true;
    // The SSR browser client exchanges the PKCE code during initialization.
    // Validate the resulting session with Auth before displaying the password form.
    client.auth.getUser().then(({ data, error }) => {
      if (!active) return;
      window.history.replaceState(null, '', window.location.pathname);
      if (error || !data.user) setMessage('הקישור פג תוקף או אינו תקין. בקש קישור חדש ופתח אותו באותו דפדפן שבו ביקשת אותו.');
      else setReady(true);
    }).catch(() => { if (active) setMessage('לא ניתן לאמת את הקישור. נסה שוב או בקש קישור חדש.'); });
    return () => { active = false; };
  }, [client, reset]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !ready || done) return;
    if (reset && (password.length < 12 || password !== confirm)) {
      setMessage('יש להזין סיסמה בת 12 תווים לפחות ולוודא ששתי הסיסמאות זהות.'); return;
    }
    setBusy(true); setMessage('');
    try {
      if (reset) {
        const { data, error: sessionError } = await client.auth.getUser();
        if (sessionError || !data.user) { setReady(false); setMessage('תוקף ההזדהות הסתיים. בקש קישור חדש.'); return; }
        const { error } = await client.auth.updateUser({ password });
        if (error) {
          setMessage(error.code === 'same_password' ? 'בחר סיסמה שונה מהסיסמה הקודמת.' : 'לא ניתן לשמור את הסיסמה. ייתכן שאינה עומדת בדרישות או שהקישור פג תוקף.'); return;
        }
        setPassword(''); setConfirm(''); setDone(true);
        await client.auth.signOut({ scope: 'local' });
        setMessage('הסיסמה עודכנה. אפשר להתחבר עם הסיסמה החדשה.');
      } else {
        const { error } = await client.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
          redirectTo: `${window.location.origin}/auth/reset-password`,
        });
        if (error) { setMessage('לא ניתן לשלוח כרגע. המתן מספר דקות ונסה שוב.'); return; }
        setDone(true); setMessage('אם קיים חשבון מתאים, יישלח קישור למייל. פתח את הקישור באותו דפדפן ובאותו מחשב.');
      }
    } catch { setMessage('אירעה תקלה בחיבור. נסה שוב.'); }
    finally { setBusy(false); }
  }

  return <main dir="rtl" className="min-h-screen flex items-center justify-center bg-teal-50 p-6">
    <section className="bg-white rounded-xl shadow p-8 w-full max-w-md space-y-5">
      <h1 className="text-2xl font-bold text-teal-800">{reset ? 'בחירת סיסמה חדשה' : 'שחזור סיסמה'}</h1>
      {message && <p role="status" className="p-3 bg-slate-100 rounded">{message}</p>}
      {reset && !ready && !message && <p role="status">בודק את קישור השחזור…</p>}
      {ready && !done && <form onSubmit={submit} className="space-y-4">
        {reset ? <>
          <label className="block">סיסמה חדשה — לפחות 12 תווים<input className="border rounded p-3 w-full" dir="ltr" type="password" autoComplete="new-password" minLength={12} required value={password} onChange={e => setPassword(e.target.value)} /></label>
          <label className="block">אימות סיסמה<input className="border rounded p-3 w-full" dir="ltr" type="password" autoComplete="new-password" minLength={12} required value={confirm} onChange={e => setConfirm(e.target.value)} /></label>
        </> : <label className="block">אימייל<input className="border rounded p-3 w-full" type="email" dir="ltr" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'נא להמתין…' : reset ? 'שמירת סיסמה חדשה' : 'שליחת קישור לשחזור'}</button>
      </form>}
      {reset && !ready && <a className="block underline" href="/auth/forgot-password">בקשת קישור חדש</a>}
      <a className="block underline" href="/admin/login">חזרה להתחברות</a>
    </section>
  </main>;
}
