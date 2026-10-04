'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';

type Script = {id: string; idx: number; title: string; hook: string; caption: string; cta: string; approved: boolean};

export function ScriptCard({s}: {s: Script}) {
  const r = useRouter();
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState({title: s.title, hook: s.hook, caption: s.caption, cta: s.cta});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function save(patch: Record<string, unknown>) {
    setBusy(true); setErr('');
    const res = await fetch(`/api/scripts/${s.id}`, {method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(patch)});
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr(j.error || 'Could not save');
    setEdit(false); r.refresh();
  }
  return (
    <div className={`card p-4 ${s.approved ? 'border-emerald-400' : ''}`}>
      <div className="flex justify-between gap-2">
        <div className="font-semibold">#{s.idx + 1} {s.title}</div>
        {s.approved && <span className="text-xs font-semibold text-emerald-700">✓ Approved</span>}
      </div>
      {edit ? (
        <div className="grid gap-2 mt-2">
          {(['title', 'hook', 'cta'] as const).map((k) => <input key={k} className="border rounded p-2 text-sm" value={draft[k]} onChange={(e) => setDraft({...draft, [k]: e.target.value})} />)}
          <textarea className="border rounded p-2 text-sm" rows={3} value={draft.caption} onChange={(e) => setDraft({...draft, caption: e.target.value})} />
        </div>
      ) : (
        <><p className="mt-2">{s.hook}</p><p className="mt-2 text-sm text-slate-500">{s.caption}</p></>
      )}
      {err && <p className="text-sm text-red-700 mt-2">{err}</p>}
      <div className="flex gap-2 mt-3">
        {edit ? (
          <><button disabled={busy} className="btn btn-primary text-sm" onClick={() => save(draft)}>Save</button><button className="btn btn-secondary text-sm" onClick={() => setEdit(false)}>Cancel</button></>
        ) : (
          <><button disabled={busy} className="btn btn-primary text-sm" onClick={() => save({approved: !s.approved})}>{s.approved ? 'Unapprove' : 'Approve'}</button><button className="btn btn-secondary text-sm" onClick={() => setEdit(true)}>Edit</button></>
        )}
      </div>
    </div>
  );
}
