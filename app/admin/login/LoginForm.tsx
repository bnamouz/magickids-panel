'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { Loader2, LogIn, AlertCircle } from 'lucide-react';

export default function LoginForm({
  redirectTo,
  initialError,
}: {
  redirectTo: string;
  initialError?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (signInErr) {
      setError('פרטי כניסה שגויים');
      setLoading(false);
      return;
    }

    if (!signInData.session?.access_token) {
      setError('לא התקבל טוקן — נסה שוב');
      setLoading(false);
      return;
    }

    // Wait for cookies to be set (small delay lets @supabase/ssr flush cookies to browser)
    await new Promise((r) => setTimeout(r, 200));

    // Verify staff via server, sending the token explicitly in Authorization header
    // as a backup in case cookies haven't propagated yet.
    const check = await fetch('/api/admin/auth/verify', {
      method: 'GET',
      credentials: 'include',
      headers: {
        Authorization: `Bearer ${signInData.session.access_token}`,
      },
    });

    if (!check.ok) {
      const body = await check.json().catch(() => ({}));
      await supabase.auth.signOut();
      const reason = body?.reason || 'unknown';
      const detail = body?.detail || body?.email || '';
      setError(
        `אין הרשאה לצוות (${reason}${detail ? ': ' + detail : ''}). פנה למנהל.`,
      );
      setLoading(false);
      return;
    }

    router.push(redirectTo);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" dir="rtl">
      {error && (
        <div className="flex gap-2 items-start bg-red-50 border-r-4 border-r-red-500 p-3 rounded">
          <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={18} />
          <div className="text-sm text-red-700">{error}</div>
        </div>
      )}

      <label className="block">
        <div className="text-sm font-semibold text-slate-700 mb-1">אימייל</div>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
          dir="ltr"
          className="w-full border border-slate-300 rounded-lg p-3 focus:outline-none focus:border-[#01696f] focus:ring-2 focus:ring-teal-100"
          placeholder="staff@yaldey.co.il"
        />
      </label>

      <label className="block">
        <div className="text-sm font-semibold text-slate-700 mb-1">סיסמה</div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full border border-slate-300 rounded-lg p-3 focus:outline-none focus:border-[#01696f] focus:ring-2 focus:ring-teal-100"
        />
      </label>

      <button
        type="submit"
        disabled={loading}
        className="btn-primary w-full flex items-center justify-center gap-2"
      >
        {loading ? <Loader2 className="animate-spin" size={18} /> : <LogIn size={18} />}
        התחברות
      </button>

      <p className="text-xs text-slate-500 text-center pt-2">
        נשכחה הסיסמה? צרו קשר עם מנהל המערכת.
      </p>
    </form>
  );
}
