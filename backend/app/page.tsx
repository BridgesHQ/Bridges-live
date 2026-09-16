// app/page.tsx — Bridges Live home (Trust default / Luxury toggle, single-cam, dynamic CTA)
'use client';
import { useState } from 'react';
import './theme.css';
import ThemeToggle from './components/ThemeToggle';
import LanguageToggle from './LanguageToggle';
import StreamPlayer from './components/StreamPlayer';
import ChatDrawer from './components/ChatDrawer';
import StreamGrid, { Card } from './components/StreamGrid';

const NAV=[{l:'New Construction',h:'/new-construction'},{l:'Apartments',h:'/apartment-locating'},{l:'Bridges Live',h:'/live-marketplace',live:true},{l:'Relocation',h:'/relocation'},{l:'Bridges Matcha',h:'/matcha'},{l:'Housing Education (501c3)',h:'/housing-resources'}];
const CARDS:Card[]=[
  {id:'1',title:'Triple Creek — Model B',category:'New Construction',cat:'real-estate',price:'From the $340s',viewers:186,type:'realestate',img:'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=500&q=80'},
  {id:'2',title:'Channelside Bay Lofts',category:'Apartments',cat:'apartments',price:'From $1,950/mo',viewers:922,type:'realestate',img:'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=500&q=80'},
  {id:'3',title:'Waterfront Estate — Apollo Beach',category:'Luxury',cat:'real-estate',price:'$1.2M',viewers:169,type:'realestate',img:'https://images.unsplash.com/photo-1613977257363-707ba9348227?auto=format&fit=crop&w=500&q=80'},
  {id:'4',title:'Relocation Tour — Wesley Chapel',category:'Relocation',cat:'relocation',price:'Buyer tour',viewers:140,type:'relocation',img:'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=500&q=80'},
  {id:'5',title:'Bridges Matcha — Ceremonial Tasting',category:'Live Commerce',cat:'live-commerce',price:'Shop live',viewers:210,type:'commerce',img:'/assets/img/matcha.jpg'},
];
export default function Home(){
  const [active,setActive]=useState<Card>(CARDS[0]);
  const stream={title:active.title,category:active.category,price:active.price,meta:active.title.includes('—')?active.title.split('—')[1]:'',viewers:active.viewers,img:active.img,type:active.type};
  return (
    <div className="min-h-screen" style={{background:'var(--bg)',color:'var(--text)'}}>
      <div className="text-center text-xs py-2 px-4" style={{background:'var(--surface-2)',color:'var(--muted)'}}>
        Bridges Global — connecting worlds through live commerce. Bridges Live: real estate now, more verticals coming. · Operated under LPT Realty
      </div>
      <header className="sticky top-0 z-40 border-b" style={{background:'var(--brand)',borderColor:'rgba(255,255,255,.1)'}}>
        <div className="mx-auto max-w-[1280px] flex items-center gap-5 px-6 h-[72px]">
          <a href="/" className="font-serif text-lg tracking-wide text-white">BRIDGES <span style={{color:'var(--accent)'}}>GLOBAL</span></a>
          <nav className="hidden lg:flex items-center gap-5 ml-auto text-sm text-white/85">
            {NAV.map(n=>(<a key={n.h} href={n.h} className="hover:opacity-100 flex items-center gap-1.5 whitespace-nowrap">{n.live&&<span className="w-2 h-2 rounded-full animate-pulse" style={{background:'var(--live)'}} />}{n.l}</a>))}
          </nav>
          <LanguageToggle/>
          <ThemeToggle/>
          <a href="/become-a-streamer" className="font-bold px-4 py-2 rounded-lg text-sm whitespace-nowrap" style={{background:'var(--accent)',color:'#0a0e17'}}>Enter Bridges Live</a>
        </div>
      </header>
      <main className="mx-auto max-w-[1280px] px-4 md:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[65%_35%] gap-4">
          <StreamPlayer stream={stream as any}/>
          <ChatDrawer/>
        </div>
        <div className="mt-8">
          <div className="text-xs font-bold uppercase tracking-wider mb-1" style={{color:'var(--live)'}}>● Live now</div>
          <h2 className="font-serif text-2xl mb-4" style={{color:'var(--text)'}}>More live tours</h2>
          <StreamGrid cards={CARDS} onSelect={setActive}/>
        </div>
      </main>
      <footer className="text-center text-xs px-4 py-4 border-t" style={{background:'var(--brand)',color:'rgba(255,255,255,.7)',borderColor:'rgba(255,255,255,.1)'}}>
        All licensed real estate services under LPT Realty · Dorota Maslowska, Broker Associate · FL BK3519799 · TX 829789-SA · Equal Housing Opportunity.
      </footer>
    </div>
  );
}
