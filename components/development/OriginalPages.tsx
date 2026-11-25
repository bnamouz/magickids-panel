'use client';
import type { OriginalPage } from '@/lib/development/official';

/** The original Maccabi pages with answer fields laid over them. The wording on the pages is never retyped. */
export default function OriginalPages({ pages, answers, onChange, disabled = false }: { pages: OriginalPage[]; answers: Record<string, string>; onChange: (id: string, value: string) => void; disabled?: boolean }) {
  return <fieldset disabled={disabled} className="min-w-0">{pages.map(p => <section key={p.page} className="my-5">
    <h3>עמוד {p.page} בערכה</h3>
    <div style={{ overflowX: 'auto', direction: 'ltr' }}><div style={{ position: 'relative', width: 900, height: 900 * p.height / p.width }}>
      <img src={p.image} alt={`עמוד ${p.page} בשאלון מכבי המקורי`} width={900} height={900 * p.height / p.width} />
      {p.fields.map((f, i) => {
        const style = { position: 'absolute' as const, left: f.rect[0] + '%', top: f.rect[1] + '%', width: f.rect[2] + '%', height: f.rect[3] + '%', margin: 0, padding: 0, fontSize: 12, backgroundColor: f.type === 'text' ? '#fff' : 'transparent', border: f.type === 'text' ? '1px solid #0d9488' : 'none', color: '#111', direction: 'rtl' as const };
        return f.type === 'text'
          ? <input key={i} style={style} aria-label={f.label || f.name} title={f.label || f.name} value={answers[f.id] || ''} maxLength={2000} required={f.required} onChange={e => onChange(f.id, e.target.value)} />
          : <input key={i} style={style} type={f.type === 'radio' ? 'radio' : 'checkbox'} name={f.id} aria-label={`${f.label || f.name} ${f.option}`} title={`${f.label || f.name} ${f.option}`} checked={answers[f.id] === f.value} onChange={e => onChange(f.id, e.target.checked ? f.value : '')} />;
      })}
    </div></div>
  </section>)}</fieldset>;
}
