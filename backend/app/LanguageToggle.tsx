// components/LanguageToggle.tsx — simple EN/PL toggle (cookie-based, Next.js i18n)
'use client';
import { useState } from 'react';
export default function LanguageToggle() {
  const [lang, setLang] = useState<'en'|'pl'>('en');
  const choose = (l:'en'|'pl') => { setLang(l); document.cookie = `NEXT_LOCALE=${l}; path=/`; };
  return (
    <div className="flex items-center gap-1 bg-white/8 border border-white/20 rounded-lg p-1 text-xs">
      <button onClick={()=>choose('en')} className={`px-3 py-1 rounded-md font-semibold transition ${lang==='en'?'bg-[#D8BC6A] text-[#0a0e17]':'text-white/60 hover:text-white'}`}>English</button>
      <button onClick={()=>choose('pl')} className={`px-3 py-1 rounded-md font-semibold transition ${lang==='pl'?'bg-[#D8BC6A] text-[#0a0e17]':'text-white/60 hover:text-white'}`}>Polski</button>
    </div>
  );
}
