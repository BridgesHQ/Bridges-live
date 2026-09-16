'use client';
import { useState } from 'react';
export type Card = { id:string; title:string; category:string; cat:string; price:string; viewers:number; img?:string; type:'realestate'|'commerce'|'relocation' };
const CATS = [{k:'all',l:'● All live'},{k:'real-estate',l:'Real Estate'},{k:'apartments',l:'Apartments'},{k:'relocation',l:'Relocation'},{k:'live-commerce',l:'Live Commerce'}];
export default function StreamGrid({cards,onSelect}:{cards:Card[];onSelect:(c:Card)=>void}){
  const [cat,setCat]=useState('all');
  const shown = cards.filter(c=>cat==='all'||c.cat===cat);
  return (
    <div>
      <div className="flex gap-2 overflow-x-auto pb-4">
        {CATS.map(c=>(
          <button key={c.k} onClick={()=>setCat(c.k)}
            className="flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold border whitespace-nowrap transition"
            style={cat===c.k?{background:'var(--accent)',color:'#0a0e17',borderColor:'var(--accent)'}:{background:'transparent',color:'var(--text)',borderColor:'var(--line)'}}>{c.l}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {shown.map(c=>(
          <button key={c.id} onClick={()=>onSelect(c)} className="text-left rounded-xl overflow-hidden border hover:-translate-y-1 transition" style={{background:'var(--surface)',borderColor:'var(--line)'}}>
            <div className="relative" style={{aspectRatio:'16/11',background:'var(--surface-2)'}}>
              {c.img&&<img src={c.img} alt="" className="w-full h-full object-cover" />}
              <span className="absolute top-2 left-2 text-white text-[11px] font-bold px-2 py-0.5 rounded flex items-center gap-1" style={{background:'var(--live)'}}><span className="w-1 h-1 bg-white rounded-full" />LIVE · {c.viewers}</span>
            </div>
            <div className="p-3">
              <div className="font-serif text-sm" style={{color:'var(--text)'}}>{c.title}</div>
              <div className="text-xs" style={{color:'var(--muted)'}}>{c.category}</div>
              <div className="text-xs font-semibold mt-0.5" style={{color:'var(--accent)'}}>{c.price}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
