import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-[#01696f] via-[#024b50] to-[#013438] text-white">
      <div className="max-w-5xl mx-auto px-6 py-16">
        <div className="text-orange-200 tracking-widest text-sm font-medium mb-4">
          YALDEY HAKESEM · ADHD DIAGNOSTIC PLATFORM
        </div>
        <div className="w-20 h-1 bg-orange-400 rounded-full mb-10" />
        <h1 className="text-6xl font-extrabold leading-tight mb-4">
          מערכת מכון<br />ילדי הקסם
        </h1>
        <p className="text-xl text-teal-100 max-w-2xl leading-relaxed mb-12">
          פלטפורמת אבחון אינטליגנטית להפרעת קשב וריכוז. שאלוני הורה ומורה,
          ניקוד אוטומטי, ודוח אבחוני מבוסס AI.
        </p>

        <div className="grid md:grid-cols-2 gap-6 mb-12">
          <Link href="/onboarding/demo" className="card text-slate-900 hover:shadow-xl transition group">
            <div className="text-orange-600 font-semibold text-sm mb-2">DEMO · הורה חדש</div>
            <h3 className="text-2xl font-bold text-[#01696f] mb-2">התחל אבחון</h3>
            <p className="text-slate-600">פתח תיק חדש ומלא את שאלון ההורה</p>
          </Link>
          <a href="/api/health" className="card text-slate-900 hover:shadow-xl transition">
            <div className="text-orange-600 font-semibold text-sm mb-2">SYSTEM</div>
            <h3 className="text-2xl font-bold text-[#01696f] mb-2">בדיקת תקינות</h3>
            <p className="text-slate-600">סטטוס שרת ו-DB</p>
          </a>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          {[
            { n: '55', l: 'שאלות הורה' },
            { n: '43', l: 'שאלות מורה' },
            { n: 'DSM-5', l: 'תקן הניקוד' },
            { n: 'AI', l: 'דוח אוטומטי' },
          ].map(s => (
            <div key={s.l} className="bg-white/10 rounded-lg p-4 border border-white/20">
              <div className="text-3xl font-extrabold text-orange-300">{s.n}</div>
              <div className="text-sm text-teal-100 mt-1">{s.l}</div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
