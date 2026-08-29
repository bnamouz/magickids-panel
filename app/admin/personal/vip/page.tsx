'use client';

import { useEffect, useState } from 'react';
import { Star, Trash2, Plus, X } from 'lucide-react';

type VIP = {
  id: string;
  phone_e164: string;
  name: string | null;
  reason: string | null;
  added_at: string;
};

export default function VipManagement() {
  const [vips, setVips] = useState<VIP[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    const res = await fetch('/api/nour/vip');
    const data = await res.json();
    setVips(data.vips || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const addVip = async () => {
    setError('');
    setSaving(true);
    const res = await fetch('/api/nour/vip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, name, reason }),
    });
    const data = await res.json();
    setSaving(false);
    if (data.error) {
      setError(data.error);
      return;
    }
    setPhone('');
    setName('');
    setReason('');
    setShowAdd(false);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('להסיר מרשימת ה-VIP? המערכת שוב תענה למספר הזה במקומך.')) return;
    await fetch(`/api/nour/vip?id=${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Star className="text-yellow-500" size={24} />
            רשימת VIP
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            מספרים שנור <strong>לא</strong> תענה להם - השיחה תמשיך לצלצל אצלך עד שתענה
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="px-4 py-2 bg-[#01696f] text-white rounded-lg hover:bg-[#015a5f] text-sm flex items-center gap-2"
        >
          <Plus size={16} />
          הוסף מספר
        </button>
      </div>

      {/* Add modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">הוסף מספר VIP</h2>
              <button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">מספר טלפון</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="050-1234567"
                  dir="ltr"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-left"
                />
                <p className="text-xs text-slate-500 mt-1">
                  אפשר להזין 0-נקודתי - המערכת תמיר ל-+972
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">שם</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="למשל: אשה"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">סיבה (אופציונלי)</label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="למשל: משפחה קרובה"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded p-2 text-sm text-red-700">
                  {error}
                </div>
              )}

              <button
                onClick={addVip}
                disabled={!phone || saving}
                className="w-full px-4 py-2 bg-[#01696f] text-white rounded-lg hover:bg-[#015a5f] disabled:opacity-50 font-medium"
              >
                {saving ? 'שומר...' : 'הוסף לרשימה'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Info card */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-900">
        <div className="flex items-start gap-2">
          <Star size={18} className="mt-0.5 flex-shrink-0" />
          <div>
            <strong>איך זה עובד:</strong> כשמישהו ברשימה מתקשר, נור מזהה אותו ומדחה את
            השיחה מיד (מבלי לענות). הפרטנר סלולר ממשיך לצלצל בפלאפון שלך עד שתענה או
            עד שהמתקשר יסיים. <strong>המתקשר לא ידע שיש נור.</strong>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500">טוען...</div>
        ) : vips.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <Star size={48} className="mx-auto mb-3 text-slate-300" />
            <p className="font-medium">אין מספרים ברשימת ה-VIP</p>
            <p className="text-sm mt-1">כשתוסיף מספרים, נור לא תענה להם במקומך</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-right">
              <tr>
                <th className="p-3">מספר</th>
                <th className="p-3">שם</th>
                <th className="p-3">סיבה</th>
                <th className="p-3">נוסף</th>
                <th className="p-3 text-center">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {vips.map((v) => (
                <tr key={v.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="p-3 ltr:text-left" dir="ltr">
                    {v.phone_e164}
                  </td>
                  <td className="p-3 font-medium">{v.name || '—'}</td>
                  <td className="p-3 text-slate-600">{v.reason || '—'}</td>
                  <td className="p-3 text-slate-500 text-xs">
                    {new Date(v.added_at).toLocaleDateString('he-IL')}
                  </td>
                  <td className="p-3 text-center">
                    <button
                      onClick={() => remove(v.id)}
                      className="text-red-600 hover:text-red-800"
                      title="הסר"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
