'use client';
import { useEffect, useState } from 'react';
export default function ThemeToggle() {
  const [theme, setTheme] = useState<'trust'|'luxury'>('trust');
  useEffect(()=>{ const s=localStorage.getItem('bridges_theme') as any; if(s){setTheme(s);document.documentElement.setAttribute('data-theme',s);} },[]);
  const toggle = ()=>{ const t = theme==='trust'?'luxury':'trust'; setTheme(t);
    document.documentElement.setAttribute('data-theme',t); localStorage.setItem('bridges_theme',t); };
  return (
    <button onClick={toggle} title="Toggle theme"
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border"
      style={{background:'var(--surface-2)',borderColor:'var(--line)',color:'var(--text)'}}>
      {theme==='trust' ? '☀️ Trust' : '🌙 Luxury'}
    </button>
  );
}
