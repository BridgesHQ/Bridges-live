'use client';
import { useState } from 'react';
export default function ChatDrawer(){
  const [msgs,setMsgs]=useState([{n:'Dorota M.',b:'Welcome! Ask about floor plans or incentives.',v:true},{n:'Marta',b:'Can you show the primary bath next?',v:false}]);
  const [t,setT]=useState('');
  const send=()=>{ if(!t)return; setMsgs(m=>[...m,{n:'You',b:t,v:false}]); setT(''); };
  return (
    <div className="rounded-2xl flex flex-col h-[420px] border" style={{background:'var(--surface)',borderColor:'var(--line)'}}>
      <div className="px-4 py-3 border-b" style={{borderColor:'var(--line)'}}>
        <div className="font-serif text-base" style={{color:'var(--text)'}}>Live chat</div>
        <div className="text-xs" style={{color:'var(--muted)'}}>Ask questions or request a tour in real time</div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5 text-sm">
        {msgs.map((m,i)=>(<div key={i}>
          <b style={{color:'var(--accent)'}}>{m.n}</b>{m.v&&<span className="ml-1 text-[10px] px-1.5 py-0.5 rounded" style={{background:'rgba(26,92,58,.15)',color:'var(--cta)'}}>✓ Verified</span>} <span style={{color:'var(--text)'}}>{m.b}</span>
        </div>))}
      </div>
      <div className="p-3 flex gap-2 border-t" style={{borderColor:'var(--line)'}}>
        <input value={t} onChange={e=>setT(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()} placeholder="Message…"
          className="flex-1 rounded-lg px-3 py-2 text-sm border" style={{background:'var(--surface-2)',borderColor:'var(--line)',color:'var(--text)'}} />
        <button onClick={send} className="px-4 rounded-lg text-sm font-bold" style={{background:'var(--accent)',color:'#0a0e17'}}>Send</button>
      </div>
    </div>
  );
}
