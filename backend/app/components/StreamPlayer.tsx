'use client';
type Stream = { title:string; category:string; price:string; meta:string; viewers:number; img?:string; playbackUrl?:string; type:'realestate'|'commerce'|'relocation' };
function ctaFor(s:Stream){ if(s.type==='commerce')return{label:'Buy now',href:'/matcha',bg:'var(--accent)',fg:'#0a0e17'};
  if(s.type==='relocation')return{label:'Book consultation',href:'/relocation',bg:'#0E4FA3',fg:'#fff'};
  return{label:'Request a showing',href:'/live-show',bg:'var(--cta)',fg:'#fff'}; }
export default function StreamPlayer({stream}:{stream:Stream}){
  const cta=ctaFor(stream);
  return (
    <div className="relative w-full rounded-2xl overflow-hidden" style={{aspectRatio:'16/9',background:'var(--surface)',boxShadow:'var(--shadow)'}}>
      {stream.playbackUrl
        ? <video src={stream.playbackUrl} autoPlay controls className="w-full h-full object-cover" />
        : stream.img ? <img src={stream.img} alt="" className="w-full h-full object-cover" />
        : <div className="absolute inset-0 grid place-items-center text-sm" style={{color:'var(--muted)'}}>Single-camera stream mounts here</div>}
      <span className="absolute top-3 left-3 text-white text-xs font-bold px-2.5 py-1 rounded flex items-center gap-1.5" style={{background:'var(--live)'}}>
        <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />LIVE</span>
      <span className="absolute top-3 right-3 text-white text-xs px-2.5 py-1 rounded" style={{background:'rgba(0,0,0,.55)'}}>👁 {stream.viewers}</span>
      <div className="absolute inset-x-0 bottom-0 p-4 flex justify-between items-end flex-wrap gap-2"
        style={{background:'linear-gradient(transparent,rgba(0,0,0,.9))'}}>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider" style={{color:'var(--accent)'}}>{stream.category}</div>
          <div className="text-xl font-serif text-white">{stream.title}</div>
          <div className="text-sm" style={{color:'rgba(255,255,255,.85)'}}>{stream.meta} · <span style={{color:'var(--accent)',fontWeight:600}}>{stream.price}</span></div>
        </div>
        <a href={cta.href} className="font-bold px-5 py-2.5 rounded-lg text-sm" style={{background:cta.bg,color:cta.fg}}>{cta.label}</a>
      </div>
    </div>
  );
}
