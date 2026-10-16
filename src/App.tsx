import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ArrowDownUp, ArrowRight, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Compass, ExternalLink, EyeOff, Heart, MapPin, Menu, Music2, RefreshCcw, Search, SlidersHorizontal, Sparkles, Ticket, X } from 'lucide-react';
import type { Concert, InterestState, Tab, AuthResponse } from './types';
import { applyTab, compareConcerts, dateParts, genres, genreGroup, getLocalPreferences, isPast, matchesDateFilter, niceDate, priceLabel, saveLocalPreferences, SHEET_URL, timeLabel, todayIST, validUrl, type DateFilter } from './lib';
import { seedConcerts } from './seed';
type Mode='loading'|'live'|'preview';
type Sort='soonest'|'newest'|'relevance';
const sortOptions: {id:Sort;label:string;description:string}[]=[
  {id:'soonest',label:'Soonest first',description:'Events happening next'},
  {id:'relevance',label:'Best match',description:'Most relevant to your search'},
  {id:'newest',label:'Recently added',description:'Latest discoveries first'}
];
const calendarWeekdays=['M','T','W','T','F','S','S'];
const dateMonthLabel=(month:Date)=>new Intl.DateTimeFormat('en-IN',{month:'long',year:'numeric',timeZone:'UTC'}).format(month);
type DateRange={start:string;end:string};
function DatePicker({value,onChange}:{value:DateRange|null;onChange:(range:DateRange|null)=>void}){
  const [open,setOpen]=useState(false);
  const [pendingStart,setPendingStart]=useState<string|null>(null);
  const [month,setMonth]=useState(()=>{
    const initial=value?.start||todayIST();
    const date=new Date(`${initial}T12:00:00Z`);
    return new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),1,12));
  });
  const rootRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!open)return;
    const closeOutside=(event:PointerEvent)=>{if(event.target instanceof Node&&!rootRef.current?.contains(event.target))setOpen(false)};
    const closeEscape=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false)};
    document.addEventListener('pointerdown',closeOutside);
    document.addEventListener('keydown',closeEscape);
    return()=>{document.removeEventListener('pointerdown',closeOutside);document.removeEventListener('keydown',closeEscape)};
  },[open]);
  const firstDay=new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth(),1,12));
  const offset=(firstDay.getUTCDay()+6)%7;
  const days=Array.from({length:42},(_,index)=>{
    const day=new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth(),index-offset+1,12));
    return {day,key:day.toISOString().slice(0,10),inMonth:day.getUTCMonth()===month.getUTCMonth()};
  });
  const moveMonth=(amount:number)=>setMonth(current=>new Date(Date.UTC(current.getUTCFullYear(),current.getUTCMonth()+amount,1,12)));
  const choose=(date:string)=>{
    if(!pendingStart){setPendingStart(date);return}
    const range=date<pendingStart?{start:date,end:pendingStart}:{start:pendingStart,end:date};
    onChange(range);setPendingStart(null);setOpen(false);
  };
  const clear=()=>{onChange(null);setPendingStart(null);setOpen(false)};
  const selectedStart=pendingStart||value?.start||null;
  const selectedEnd=pendingStart?null:value?.end||null;
  const selectionLabel=pendingStart?`Choose an end date after ${niceDate(pendingStart)}`:value?`${niceDate(value.start)} – ${niceDate(value.end)}`:'Select a start date';
  return <div className="date-picker" ref={rootRef}>
    <button type="button" className="date-trigger" aria-label={value?`Dates: ${niceDate(value.start)} to ${niceDate(value.end)}`:'Dates: Upcoming'} aria-haspopup="dialog" aria-expanded={open} onClick={()=>{if(!open)setPendingStart(null);setOpen(current=>!current)}}>
      <CalendarDays size={17} aria-hidden="true"/><span>{value?`${niceDate(value.start)} – ${niceDate(value.end)}`:'Upcoming'}</span><ChevronDown size={15} aria-hidden="true" className={open?'sort-chevron open':''}/>
    </button>
    {open&&<div className="date-popover" role="dialog" aria-label="Choose event date range">
      <div className="calendar-heading"><button type="button" className="calendar-nav" aria-label="Previous month" onClick={()=>moveMonth(-1)}><ChevronLeft size={17}/></button><strong>{dateMonthLabel(month)}</strong><button type="button" className="calendar-nav" aria-label="Next month" onClick={()=>moveMonth(1)}><ChevronRight size={17}/></button></div>
      <div className="calendar-grid" aria-label={dateMonthLabel(month)}>
        {calendarWeekdays.map((day,index)=><span className="calendar-weekday" key={`${day}-${index}`}>{day}</span>)}
        {days.map(({day,key,inMonth})=>{
          const inRange=Boolean(selectedStart&&selectedEnd&&key>=selectedStart&&key<=selectedEnd);
          const endpoint=key===selectedStart||key===selectedEnd;
          return <button type="button" key={key} aria-label={new Intl.DateTimeFormat('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(day)} aria-pressed={endpoint} className={'calendar-day '+(!inMonth?'outside':'')+(inRange?' in-range':'')+(endpoint?' selected':'')+(key===todayIST()?' today':'')} onClick={()=>choose(key)}>{day.getUTCDate()}</button>;
        })}
      </div>
      <div className="calendar-footer"><span>{selectionLabel}</span>{(value||pendingStart)&&<button type="button" onClick={clear}>Clear dates</button>}</div>
    </div>}
  </div>;
}
function SortPicker({value,onChange}:{value:Sort;onChange:(value:Sort)=>void}){
  const [open,setOpen]=useState(false);
  const [activeIndex,setActiveIndex]=useState(()=>sortOptions.findIndex(option=>option.id===value));
  const triggerRef=useRef<HTMLButtonElement>(null);
  const optionRefs=useRef<(HTMLDivElement|null)[]>([]);
  const selectedIndex=sortOptions.findIndex(option=>option.id===value);
  useEffect(()=>{if(open)optionRefs.current[activeIndex]?.focus()},[open,activeIndex]);
  useEffect(()=>{
    if(!open)return;
    const closeOutside=(event:PointerEvent)=>{if(!(event.target instanceof Element)||!event.target.closest('.sort-picker'))setOpen(false)};
    document.addEventListener('pointerdown',closeOutside);
    return()=>document.removeEventListener('pointerdown',closeOutside);
  },[open]);
  const show=(index=selectedIndex)=>{setActiveIndex(index);setOpen(true)};
  const close=(restoreFocus=false)=>{setOpen(false);if(restoreFocus)triggerRef.current?.focus()};
  const choose=(option:Sort)=>{onChange(option);close(true)};
  const move=(index:number)=>setActiveIndex((index+sortOptions.length)%sortOptions.length);
  const handleTriggerKeyDown=(event:ReactKeyboardEvent<HTMLButtonElement>)=>{
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();show(selectedIndex+(event.key==='ArrowDown'?1:-1));}
    else if(event.key==='Enter'||event.key===' '){event.preventDefault();open?close():show();}
  };
  return <div className="sort-picker">
    <button ref={triggerRef} type="button" className="sort-trigger" aria-label={`Sort events: ${sortOptions[selectedIndex].label}`} aria-haspopup="listbox" aria-expanded={open} aria-controls="sort-options" onClick={()=>open?close():show()} onKeyDown={handleTriggerKeyDown}>
      <ArrowDownUp size={17} aria-hidden="true"/><span>{sortOptions[selectedIndex].label}</span><ChevronDown size={15} aria-hidden="true" className={open?'sort-chevron open':''}/>
    </button>
    {open&&<div id="sort-options" className="sort-popover" role="listbox" aria-label="Sort events">
      {sortOptions.map((option,index)=><div key={option.id} ref={element=>{optionRefs.current[index]=element}} id={`sort-option-${option.id}`} className={'sort-option '+(value===option.id?'selected':'')+(activeIndex===index?' focused':'')} role="option" aria-selected={value===option.id} tabIndex={activeIndex===index?0:-1} onClick={()=>choose(option.id)} onKeyDown={event=>{
        if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();move(index+(event.key==='ArrowDown'?1:-1));}
        else if(event.key==='Home'){event.preventDefault();setActiveIndex(0)}
        else if(event.key==='End'){event.preventDefault();setActiveIndex(sortOptions.length-1)}
        else if(event.key==='Enter'||event.key===' '){event.preventDefault();choose(option.id)}
        else if(event.key==='Escape'){event.preventDefault();close(true)}
        else if(event.key==='Tab')close();
      }}>
        <span className="sort-option-copy"><strong>{option.label}</strong><small>{option.description}</small></span>
        {value===option.id&&<Check size={16} aria-hidden="true"/>}
      </div>)}
    </div>}
  </div>;
}
const label:Record<Tab,string>={discover:'Discover',wishlist:'Wishlist',not_interested:'Not interested'};
const palette:Record<string,{ink:string,background:string,initial:string}>={
  'Classical':{ink:'#885638',background:'linear-gradient(135deg,#e1cdbb,#eddcc9 68%,#c4a486)',initial:'RAAG'},
  'Sufi & Mystical':{ink:'#c3a7f2',background:'linear-gradient(135deg,#2c315a,#493a7e 65%,#1a263f)',initial:'ISHQ'},
  'Rock & Metal':{ink:'#f7a473',background:'linear-gradient(130deg,#181a1f,#353039 55%,#5d332e)',initial:'LIVE'},
  'Bollywood & Pop':{ink:'#f9d8a0',background:'linear-gradient(135deg,#954e46,#d4826b,#7d465a)',initial:'BEAT'},
  'Jazz & Blues':{ink:'#c9e0e1',background:'linear-gradient(135deg,#244853,#3f6b70,#1a303c)',initial:'JAZZ'},
  'Indie & Fusion':{ink:'#e3d3a8',background:'linear-gradient(135deg,#3e5f50,#668a69,#274c52)',initial:'SOUND'},
  'Other':{ink:'#e9e2d7',background:'linear-gradient(135deg,#6a675e,#939084,#4f5a5c)',initial:'MUSIC'}
};
const navMeta=[{id:'discover' as Tab,icon:Compass},{id:'wishlist' as Tab,icon:Heart},{id:'not_interested' as Tab,icon:EyeOff}];
const tierOrder:Record<string,number>={Core:0,Strong:1,Broad:2};
const compareRelevance=(a:Concert,b:Concert)=>(tierOrder[a.relevance]??3)-(tierOrder[b.relevance]??3)||compareConcerts(a,b);
function Cover({event,large=false}:{event:Concert;large?:boolean}){
  const group=genreGroup(event.genre,event.subgenres.join(' ')),p=palette[group];
  return <div className={`cover ${large?'cover-large':''}`} style={{background:p.background,color:p.ink}} aria-hidden="true">
    <div className="cover-topline">BENGALURU · LIVE</div><div className="cover-rings"><span/><span/><span/></div>
    <div className="cover-text">{p.initial}</div><div className="cover-base">{event.genre.toUpperCase()}</div>
  </div>;
}
/** One carousel instance per event/card; failed hotlinked images never break the layout. */
function EventGallery({event,large=false}:{event:Concert;large?:boolean}){
  const [slide,setSlide]=useState(0);
  const [failed,setFailed]=useState<string[]>([]);
  const touchStart=useRef<{x:number;y:number}|null>(null);
  const available=event.images.filter(image=>!failed.includes(image.url));
  const active=available[Math.min(slide,Math.max(0,available.length-1))];
  const host=(url:string)=>{try{const h=new URL(url).hostname.replace(/^www\./,'');return h==='in.bookmyshow.com'?'BookMyShow':h==='district.in'?'District':h==='sabhablr.in'?'Sabha BLR':h==='bangaloreinternationalcentre.org'?'BIC':h;}catch{return 'Source'}};
  const move=(direction:number)=>setSlide(current=>(Math.min(current,available.length-1)+direction+available.length)%available.length);
  const onError=()=>{if(active){setFailed(old=>[...old,active.url]);setSlide(0)}};
  return <div className={'event-gallery '+(large?'gallery-large':'')} aria-label={`Event images for ${event.name}`} onTouchStart={e=>{touchStart.current={x:e.touches[0].clientX,y:e.touches[0].clientY}}} onTouchEnd={e=>{const start=touchStart.current;touchStart.current=null;if(!start||available.length<2)return;const dx=e.changedTouches[0].clientX-start.x,dy=e.changedTouches[0].clientY-start.y;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.3)move(dx<0?1:-1)}}>
    {active?<>
      <img className="gallery-image" src={active.url} alt={active.alt||`${event.name} event poster`} loading={large?'eager':'lazy'} decoding="async" referrerPolicy="no-referrer" onError={onError}/>
      <div className="gallery-source"><a href={active.sourceUrl} target="_blank" rel="noopener noreferrer" title="Open original event image source" aria-label={`Image from ${host(active.sourceUrl)} – original event page`} onClick={e=>e.stopPropagation()}>Artwork: {host(active.sourceUrl)} <ExternalLink size={11}/></a></div>
      {available.length>1&&<>
        <button type="button" className="gallery-arrow gallery-arrow-prev" aria-label={`Previous image for ${event.name}`} onClick={()=>move(-1)}><ChevronLeft size={19}/></button>
        <button type="button" className="gallery-arrow gallery-arrow-next" aria-label={`Next image for ${event.name}`} onClick={()=>move(1)}><ChevronRight size={19}/></button>
        <div className="gallery-dots" aria-label="Image slides">{available.map((image,i)=><button key={image.url} type="button" className={image.url===active.url?'active':''} aria-label={`Show image ${i+1} of ${available.length}`} aria-current={image.url===active.url?'true':undefined} onClick={()=>setSlide(i)}/>)}</div>
        <span className="gallery-counter">{Math.min(slide,available.length-1)+1}/{available.length}</span>
      </>}
    </>:<Cover event={event} large={large}/>}
  </div>;
}
function ArtistLine({artists,modal=false}:{artists:string;modal?:boolean}){
  const names=artists?.split(';').map(n=>n.trim()).filter(Boolean)||[];
  const meaningful=names.filter(n=>!/(?:not yet specified|not yet verified|lineup not yet|artists? not)/i.test(n));
  return <div className={modal?'featured-artists modal-featured-artists':'featured-artists'}>
    <div className="artists-label"><Music2 size={13}/> {modal?'PERFORMERS & ARTISTS':'PERFORMING ARTISTS'}</div>
    <div className="artist-names">{meaningful.length?meaningful.map((name,i)=><span key={`${i}-${name}`}>{name}</span>):<span>Lineup to be announced</span>}</div>
  </div>;
}
function DateTile({date}:{date:string}){const d=dateParts(date);return <div className="date-tile"><span>{d.month}</span><strong>{d.day}</strong><small>{d.weekday}</small></div>}
function StatusPill({event}:{event:Concert}){let s=event.ticketStatus||'Unknown';if(event.eventStatus==='Cancelled'||event.eventStatus==='Postponed')s=event.eventStatus;const blocked=/sold out|cancelled|postponed|conflicting/i.test(s+' '+event.verification);return <span className={'status-pill '+(blocked?'status-alert':'')}>{s}</span>}
function ConcertCard({event,onPref,onDetail,busy}:{event:Concert,onPref:(id:string,s:InterestState)=>void,onDetail:(e:Concert)=>void,busy:boolean}){
  const group=genreGroup(event.genre,event.subgenres.join(' '));const booking=validUrl(event.bookingUrl),source=validUrl(event.sourceUrl);
  return <article className="event-card">
    <div className="card-image-wrap"><EventGallery key={event.id} event={event}/><div className="card-date"><DateTile date={event.date}/></div><div className="image-tag">{group}</div></div>
    <div className="card-body">
      <div className="card-meta"><span>{niceDate(event.date).toUpperCase()} <b className="dot">·</b> {timeLabel(event.time)}</span><StatusPill event={event}/></div>
      <button className="event-name" onClick={()=>onDetail(event)}>{event.name}</button>
      <ArtistLine artists={event.artists}/>
      <div className="venue"><MapPin size={15}/><span>{event.venue || 'Venue TBA'}{event.area?` · ${event.area}`:''}</span></div>
      <div className="event-footer"><div><strong>{priceLabel(event)}</strong><div className="event-small">{event.format || 'Live event'}</div></div><button className="details-btn" onClick={()=>onDetail(event)}>Details <ArrowRight size={15}/></button></div>
      <div className="event-actions">
        <button disabled={busy} aria-pressed={event.preference==='wishlisted'} className={'pref-btn '+(event.preference==='wishlisted'?'liked':'')} onClick={()=>onPref(event.id,event.preference==='wishlisted'?'neutral':'wishlisted')}><Heart size={17} fill={event.preference==='wishlisted'?'currentColor':'none'}/>{event.preference==='wishlisted'?'Wishlisted':'Wishlist'}</button>
        <button disabled={busy} aria-pressed={event.preference==='not_interested'} className={'pref-btn '+(event.preference==='not_interested'?'rejected':'')} onClick={()=>onPref(event.id,event.preference==='not_interested'?'neutral':'not_interested')}><EyeOff size={17}/>{event.preference==='not_interested'?'Restore':'Not interested'}</button>
        {(booking||source)?<a className="book-btn" href={booking||source} target="_blank" rel="noopener noreferrer" aria-label={`Open booking or source for ${event.name}`} title={booking?'Tickets':'Source listing'}><ExternalLink size={17}/></a>:<span className="book-btn disabled" title="No verified booking or source link"><ExternalLink size={17}/></span>}
      </div>
    </div>
  </article>;
}
function DetailModal({event,onClose,onPref,busy}:{event:Concert,onClose:()=>void,onPref:(id:string,s:InterestState)=>void,busy:boolean}){
  useEffect(()=>{const cb=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()};document.addEventListener('keydown',cb);return()=>document.removeEventListener('keydown',cb)},[onClose]);
  const target=validUrl(event.bookingUrl)||validUrl(event.sourceUrl);
  return <div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><section role="dialog" aria-modal="true" aria-label={event.name} className="modal"><button className="modal-close" aria-label="Close" onClick={onClose}><X size={20}/></button><div className="modal-cover"><EventGallery key={event.id} event={event} large/></div><div className="modal-content"><div className="eyebrow">{event.genre} · {event.format}</div><h2>{event.name}</h2><ArtistLine artists={event.artists} modal/><div className="modal-facts"><div><CalendarDays size={17}/><span>{niceDate(event.date)}, {timeLabel(event.time)}</span></div><div><MapPin size={17}/><span>{event.venue||'Venue TBA'}{event.area?' · '+event.area:''}</span></div><div><Ticket size={17}/><span>{priceLabel(event)} · {event.ticketStatus||'Status unknown'}</span></div></div>{event.notes&&<p className="modal-notes">{event.notes}</p>}{event.tributeTo&&<p className="modal-notes">Tribute to: {event.tributeTo}</p>}<p className="verification">Listing confidence: {event.verification||'Unknown'} · Event status: {event.eventStatus||'Unknown'}</p><div className="modal-actions"><button className="primary-action" disabled={busy} onClick={()=>onPref(event.id,event.preference==='wishlisted'?'neutral':'wishlisted')}><Heart size={17} fill={event.preference==='wishlisted'?'currentColor':'none'}/>{event.preference==='wishlisted'?'Remove wishlist':'Wishlist event'}</button><button className="secondary-action" disabled={busy} onClick={()=>onPref(event.id,event.preference==='not_interested'?'neutral':'not_interested')}><EyeOff size={17}/>{event.preference==='not_interested'?'Restore':'Not interested'}</button>{target&&<a className="secondary-action" href={target} target="_blank" rel="noopener noreferrer">{event.bookingUrl?'Book tickets':'View source'}<ExternalLink size={15}/></a>}</div></div></section></div>
}
function LoginGate({onChange}:{onChange:()=>void}){
  const configured=Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);
  useEffect(()=>{if(!configured)return;let cancelled=false;let tries=0;const tryRender=()=>{if(cancelled)return; const g=window.google?.accounts?.id;if(g){g.initialize({client_id:import.meta.env.VITE_GOOGLE_CLIENT_ID,callback:async({credential}:{credential:string})=>{try{const res=await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({credential})});if(!res.ok)throw Error('Account not authorized');onChange()}catch(e){alert(e instanceof Error?e.message:'Sign-in failed')}}});const mount=document.getElementById('google-sign-in');if(mount){mount.innerHTML='';g.renderButton(mount,{theme:'outline',size:'large',shape:'pill',text:'signin_with'})}}else if(tries++<25)setTimeout(tryRender,200)};tryRender();return()=>{cancelled=true}},[configured,onChange]);
  return <div className="login-card"><Music2 size={32}/><h2>Your concert collection</h2><p>Sign in with a verified Google account to see your events and save your own preferences.</p>{configured?<div id="google-sign-in"/>:<p className="fineprint">Google Sign-In needs a client ID configured during deployment. Until then, preview mode is available locally.</p>}</div>;
}

export default function App(){
  const [events,setEvents]=useState<Concert[]>(()=>seedConcerts(getLocalPreferences()));
  const [mode,setMode]=useState<Mode>('loading');const [auth,setAuth]=useState<AuthResponse>({authenticated:false,configured:false});
  const [tab,setTab]=useState<Tab>('discover');const [search,setSearch]=useState('');const [genre,setGenre]=useState('All genres');const [sort,setSort]=useState<Sort>('soonest');
  const [dateFilter,setDateFilter]=useState<DateFilter>('upcoming');const [selectedRange,setSelectedRange]=useState<DateRange|null>(null);const [loading,setLoading]=useState(false);const [busy,setBusy]=useState<string>('');const [detailId,setDetailId]=useState<string|null>(null);const [message,setMessage]=useState('');const [lastSync,setLastSync]=useState('');const [menu,setMenu]=useState(false);
  const showMessage=(s:string)=>{setMessage(s);window.setTimeout(()=>setMessage(''),5000)};
  const load=useCallback(async()=>{setLoading(true);try{const session=await fetch('/api/me',{credentials:'include'});if(!session.ok)throw Error('Cloudflare service unavailable');const me:AuthResponse=await session.json();setAuth(me);if(!me.configured){setMode('preview');setEvents(seedConcerts(getLocalPreferences()));setLastSync('Snapshot · 13 Oct 2026');return}if(!me.authenticated){setMode('live');setEvents([]);setLastSync('Google sign-in required');return}const res=await fetch('/api/events',{credentials:'include'});if(!res.ok)throw Error('Failed to load events from Cloudflare');const json=await res.json() as {events:Concert[];lastSynced?:string};setEvents(json.events);setMode('live');setLastSync(json.lastSynced||'Live catalogue · preferences in Cloudflare')}catch(e){setAuth({authenticated:false,configured:true});setMode('live');setEvents([]);setLastSync('Cloudflare service unavailable');showMessage(e instanceof Error?e.message:'Cloudflare service unavailable')}finally{setLoading(false)}},[]);
  useEffect(()=>{void load()},[load]);
  const update=useCallback(async(id:string,state:InterestState)=>{
    if(busy)return;
    const prev=events.find(e=>e.id===id)?.preference||'neutral';setBusy(id);
    setEvents(old=>old.map(e=>e.id===id?{...e,preference:state}:e));
    try{if(mode==='preview'){const prefs=getLocalPreferences();prefs[id]=state;saveLocalPreferences(prefs)}else{const res=await fetch(`/api/events/${encodeURIComponent(id)}/preference`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({state})});if(!res.ok)throw Error((await res.json().catch(()=>({error:'Cannot save preference'}))).error||'Could not save preference');const json=await res.json() as {state:InterestState};setEvents(old=>old.map(e=>e.id===id?{...e,preference:json.state}:e))}}
    catch(e){setEvents(old=>old.map(ev=>ev.id===id?{...ev,preference:prev}:ev));showMessage(e instanceof Error?e.message:'Saving failed')}
    finally{setBusy('')}
  },[events,busy,mode]);
  const counts=useMemo(()=>({discover:events.filter(e=>e.preference!=='not_interested'&&!isPast(e.date)).length,wishlist:events.filter(e=>e.preference==='wishlisted').length,not_interested:events.filter(e=>e.preference==='not_interested').length,upcoming:events.filter(e=>!isPast(e.date)).length,past:events.filter(e=>isPast(e.date)).length}),[events]);
  const filtered=useMemo(()=>{
    const needle=search.trim().toLowerCase();let list=applyTab(events,tab).filter(e=>{
      if(genre!=='All genres'&&genreGroup(e.genre,e.subgenres.join(' '))!==genre)return false;
      if(selectedRange&&(e.date<selectedRange.start||e.date>selectedRange.end))return false;
      if(!matchesDateFilter(e.date,dateFilter))return false;
      return !needle||[e.name,e.artists,e.genre,e.venue,e.area,e.subgenres.join(' '),e.tributeTo].join(' ').toLowerCase().includes(needle);
    });
    if(sort==='newest')list=list.sort((a,b)=>b.firstSeen.localeCompare(a.firstSeen)||compareConcerts(a,b));
    else if(sort==='relevance')list=list.sort(compareRelevance);else list=list.sort(compareConcerts);
    return list;
  },[events,tab,search,genre,sort,dateFilter,selectedRange]);
  const eventWord=filtered.length===1?'event':'events';
  const viewCountLabel=selectedRange?`${filtered.length} ${eventWord} · ${niceDate(selectedRange.start)} – ${niceDate(selectedRange.end)}`:`${filtered.length} upcoming ${eventWord}`;
  const hasNonDefaultFilters=Boolean(search.trim())||genre!=='All genres'||selectedRange!==null||dateFilter!=='upcoming'||sort!=='soonest';
  const detail=events.find(e=>e.id===detailId);const authRequired=mode==='live'&&!auth.authenticated;
  return <div className="site-shell">
    <header className="site-header"><div className="header-inner"><a className="brand" href="/" onClick={e=>{e.preventDefault();setTab('discover')}}><div className="brand-icon"><Music2 size={24}/></div><div><strong>BENGALURU <em>LIVE</em></strong><small>YOUR CITY. YOUR MUSIC.</small></div></a><nav className="desktop-nav" aria-label="Main navigation">{navMeta.map(x=><button className={tab===x.id?'selected':''} key={x.id} onClick={()=>{setTab(x.id);setMenu(false)}}><x.icon size={16}/>{label[x.id]}{x.id!=='discover'&&counts[x.id]>0&&<span className="nav-count">{counts[x.id]}</span>}</button>)}</nav><div className="header-right"><span className={'sync-dot '+(mode==='live'?'online':'')}/><span className="sync-label">{mode==='live'?'Live catalogue':'Preview'}</span>{mode==='live'&&auth.authenticated&&<button className="refresh-btn logout-btn" onClick={async()=>{try{const res=await fetch('/api/auth/logout',{method:'POST',credentials:'include'});if(!res.ok)throw Error('Sign out failed');setAuth(current=>({...current,authenticated:false,email:undefined}));setEvents([]);setLastSync('Google sign-in required')}catch(e){showMessage(e instanceof Error?e.message:'Sign out failed')}}} aria-label="Sign out" title="Sign out">Sign out</button>}<button className="refresh-btn" onClick={()=>void load()} aria-label="Refresh events" title="Refresh events"><RefreshCcw size={17} className={loading?'spinning':''}/></button><button className="mobile-menu" onClick={()=>setMenu(!menu)} aria-label="Toggle navigation"><Menu size={20}/></button></div></div>{menu&&<nav className="mobile-drawer">{navMeta.map(x=><button key={x.id} onClick={()=>{setTab(x.id);setMenu(false)}}>{label[x.id]} <span>{counts[x.id]}</span></button>)}</nav>}</header>
    <main>
      <section className="hero"><div className="hero-copy"><div className="eyebrow"><span className="line"/>A PERSONAL GUIDE TO LIVE MUSIC</div><h1>Find your next<br/><span>unforgettable</span> night.</h1><p>From quiet Sufi baithaks to roaring rock concerts. All the sounds of Bengaluru, curated in one place.</p><div className="hero-row"><div className="stat"><strong>{events.length}</strong><span>total events</span><small>{counts.upcoming} upcoming · {counts.past} past</small></div><div className="stat"><strong>{counts.wishlist}</strong><span>on your wishlist</span></div><div className="stat"><strong>{counts.not_interested}</strong><span>passed on</span></div></div></div><div className="hero-art" aria-hidden="true"><div className="sun-disc"/><div className="hero-record"><div className="record-label"><Music2 size={38}/><span>BLR 001</span></div></div><div className="floating-note">LIVE IN BENGALURU</div></div></section>
      <div className="page-wrap">
        {mode==='preview'&&<div className="notice preview-notice"><span><strong>Local preview:</strong> Events are a snapshot of the Google Sheet from 13 Oct 2026. Preferences are saved only in this browser until the backend is deployed.</span><a href={SHEET_URL} target="_blank" rel="noreferrer">Open live Sheet <ExternalLink size={13}/></a></div>}
        {authRequired&&<LoginGate onChange={()=>void load()}/>}
        {!authRequired&&<>
          <div className="section-title"><div><div className="eyebrow subtle">YOUR CONCERT COLLECTION</div><h2>{tab==='discover'?'Explore the music':tab==='wishlist'?'Your wishlist':'Not interested'}</h2><p>{tab==='discover'?'Discover what’s playing around the city. Save what you love.':tab==='wishlist'?'All the shows you have your eye on, in one place.':'Concerts you passed on. Nothing is deleted; restore any time.'}</p></div><div className="view-count">{viewCountLabel}</div></div>
          <div className="toolbar"><label className="search-box"><Search size={19}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search artists, concerts, venues..." aria-label="Search concerts"/>{search&&<button type="button" aria-label="Clear search" onClick={()=>setSearch('')}><X size={15}/></button>}</label><DatePicker value={selectedRange} onChange={range=>{setSelectedRange(range);setDateFilter(range?'date':'upcoming')}}/><div className="sort-control"><span id="sort-label">Sort by</span><SortPicker value={sort} onChange={setSort}/></div></div>
          {hasNonDefaultFilters&&<div className="date-toolbar"><button type="button" className="reset-filters" onClick={()=>{setSearch('');setGenre('All genres');setSelectedRange(null);setDateFilter('upcoming');setSort('soonest')}}>Clear filters <X size={14}/></button></div>}
          <div className="filters-row"><div className="genre-scroll"><SlidersHorizontal size={17} className="filter-icon"/>{genres.map(g=><button key={g} className={'genre-pill '+(g===genre?'active':'')} onClick={()=>setGenre(g)}>{g}</button>)}</div></div>
          <div className="list-settings"><span>{lastSync}</span></div>
          {filtered.length>0?<div className="event-grid">{filtered.map(e=><ConcertCard key={e.id} event={e} busy={busy===e.id} onPref={update} onDetail={x=>setDetailId(x.id)}/>)}</div>:<div className="empty-state"><div className="empty-icon">{tab==='wishlist'?<Heart size={31}/>:tab==='not_interested'?<EyeOff size={31}/>:<Search size={31}/>}</div><h3>{tab==='wishlist'?'Your wishlist is waiting':tab==='not_interested'?'Nothing dismissed yet':'No concerts found'}</h3><p>{tab==='wishlist'?'Save concerts from Discover and they will appear here.':tab==='not_interested'?'Events you mark as not interested will be here, ready to restore.':'Adjust your search, genre or date filters to see more concerts.'}</p><button onClick={()=>{setTab('discover');setSearch('');setGenre('All genres');setSelectedRange(null);setDateFilter('upcoming')}}>Explore concerts <ArrowRight size={16}/></button></div>}
          <section className="bottom-callout"><div><span className="eyebrow">NEVER MISS A NOTE</span><h2>The city keeps playing.</h2><p>New concerts are researched every morning at 9 AM IST. Check back for new discoveries.</p></div><a href={SHEET_URL} target="_blank" rel="noopener noreferrer">View event database <ExternalLink size={17}/></a></section>
        </>}
      </div>
    </main>
    <footer><div className="footer-inner"><span><Music2 size={17}/> BENGALURU LIVE</span><span>Made for the music, not the noise.</span><a href={SHEET_URL} rel="noopener noreferrer" target="_blank">Google Sheets database <ExternalLink size={13}/></a></div></footer>
    {detail&&<DetailModal event={detail} onClose={()=>setDetailId(null)} onPref={update} busy={busy===detail.id}/>}
    {message&&<div role="alert" className="toast"><Sparkles size={16}/>{message}<button onClick={()=>setMessage('')}><X size={16}/></button></div>}
  </div>;
}
