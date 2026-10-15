import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownUp, ArrowRight, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Compass, ExternalLink, EyeOff, Heart, MapPin, Menu, Music2, RefreshCcw, Search, SlidersHorizontal, Sparkles, Ticket, X } from 'lucide-react';
import type { Concert, InterestState, Tab, AuthResponse } from './types';
import { applyTab, compareConcerts, dateParts, genres, genreGroup, getLocalPreferences, isPast, niceDate, priceLabel, saveLocalPreferences, SHEET_URL, timeLabel, todayIST, validUrl } from './lib';
import { seedConcerts } from './seed';
import {authorizeGoogleClient,clientAccount,clientLogout,clientSheetsEnabled,clientSignedIn,getGoogleClientEvents,restoreGoogleClient,setGoogleClientPreference} from './clientSheets';

type Mode='loading'|'live'|'client'|'preview';
type Sort='soonest'|'newest'|'relevance';
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
  return <div className="login-card"><Music2 size={32}/><h2>Private concert collection</h2><p>Sign in with the Google account authorized to access your personal concert tracker.</p>{configured?<div id="google-sign-in"/>:<p className="fineprint">Google Sign-In needs a client ID configured during deployment. Until then, preview mode is available locally.</p>}</div>;
}

export default function App(){
  const [events,setEvents]=useState<Concert[]>(()=>clientSheetsEnabled()?[]:seedConcerts(getLocalPreferences()));
  const [mode,setMode]=useState<Mode>('loading');const [auth,setAuth]=useState<AuthResponse>({authenticated:false,configured:false});
  const [tab,setTab]=useState<Tab>('discover');const [search,setSearch]=useState('');const [genre,setGenre]=useState('All genres');const [sort,setSort]=useState<Sort>('soonest');
  const [includePast,setIncludePast]=useState(false);const [dateFilter,setDateFilter]=useState('all');const [loading,setLoading]=useState(false);const [busy,setBusy]=useState<string>('');const [detailId,setDetailId]=useState<string|null>(null);const [message,setMessage]=useState('');const [lastSync,setLastSync]=useState('');const [menu,setMenu]=useState(false);
  const showMessage=(s:string)=>{setMessage(s);window.setTimeout(()=>setMessage(''),5000)};
  const load=useCallback(async()=>{setLoading(true);try{if(clientSheetsEnabled()){setMode('client');if(!clientSignedIn() && !(await restoreGoogleClient())){setAuth({authenticated:false,configured:true});setEvents([]);setLastSync('Google sign-in required');return;}const current=await getGoogleClientEvents();setEvents(current);setAuth({authenticated:true,configured:true,email:clientAccount()});setLastSync('Live Google Sheets · '+new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kolkata'}));return;}const session=await fetch('/api/me',{credentials:'include'});if(!session.ok)throw Error('Backend unavailable or not configured');const me:AuthResponse=await session.json();setAuth(me);if(!me.configured)throw Error('Backend configuration incomplete');if(!me.authenticated){setMode('live');setEvents([]);return}const res=await fetch('/api/events',{credentials:'include'});if(!res.ok)throw Error('Failed to fetch events');const json=await res.json() as {events:Concert[];lastSynced?:string};setEvents(json.events);setMode('live');setLastSync(json.lastSynced||'Live Google Sheets')}catch(e){if(clientSheetsEnabled()){setMode('client');setAuth({authenticated:clientSignedIn(),configured:true,email:clientAccount()});setEvents([]);setLastSync('Google Sheets unavailable');showMessage(e instanceof Error?e.message:'Google Sheets unavailable')}else{setMode('live');setEvents([]);setAuth({authenticated:false,configured:true});setLastSync('Backend unavailable');showMessage(e instanceof Error?e.message:'Backend unavailable')}}finally{setLoading(false)}},[]);
  useEffect(()=>{void load()},[load]);
  const update=useCallback(async(id:string,state:InterestState)=>{
    if(busy)return;
    const prev=events.find(e=>e.id===id)?.preference||'neutral';setBusy(id);
    setEvents(old=>old.map(e=>e.id===id?{...e,preference:state}:e));
    try{if(mode==='preview'){const prefs=getLocalPreferences();prefs[id]=state;saveLocalPreferences(prefs)}else if(mode==='client'){await setGoogleClientPreference(id,state,crypto.randomUUID())}else{const res=await fetch(`/api/events/${encodeURIComponent(id)}/preference`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({state,requestId:crypto.randomUUID()})});if(!res.ok)throw Error((await res.json().catch(()=>({error:'Cannot save preference'}))).error||'Could not save preference');const json=await res.json() as {state:InterestState};setEvents(old=>old.map(e=>e.id===id?{...e,preference:json.state}:e))}}
    catch(e){setEvents(old=>old.map(ev=>ev.id===id?{...ev,preference:prev}:ev));showMessage(e instanceof Error?e.message:'Saving failed')}
    finally{setBusy('')}
  },[events,busy,mode]);
  const counts=useMemo(()=>({discover:events.filter(e=>e.preference!=='not_interested'&&!isPast(e.date)).length,wishlist:events.filter(e=>e.preference==='wishlisted').length,not_interested:events.filter(e=>e.preference==='not_interested').length}),[events]);
  const filtered=useMemo(()=>{
    const needle=search.trim().toLowerCase();let list=applyTab(events,tab,includePast).filter(e=>{
      if(genre!=='All genres'&&genreGroup(e.genre,e.subgenres.join(' '))!==genre)return false;
      if(dateFilter==='week'){const end=new Date(todayIST()+'T00:00:00Z');end.setUTCDate(end.getUTCDate()+7);if(e.date> end.toISOString().slice(0,10) || e.date<todayIST())return false}
      if(dateFilter==='month'&&e.date.slice(0,7)!==todayIST().slice(0,7))return false;
      return !needle||[e.name,e.artists,e.genre,e.venue,e.area,e.subgenres.join(' '),e.tributeTo].join(' ').toLowerCase().includes(needle);
    });
    if(sort==='newest')list=list.sort((a,b)=>b.firstSeen.localeCompare(a.firstSeen)||compareConcerts(a,b));
    else if(sort==='relevance')list=list.sort(compareRelevance);else list=list.sort(compareConcerts);
    return list;
  },[events,tab,includePast,search,genre,sort,dateFilter]);
  const detail=events.find(e=>e.id===detailId);const checkingSession=mode==='client'&&loading&&!auth.authenticated;const authRequired=(mode==='live'||mode==='client')&&!auth.authenticated&&!checkingSession;
  return <div className="site-shell">
    <header className="site-header"><div className="header-inner"><a className="brand" href="/" onClick={e=>{e.preventDefault();setTab('discover')}}><div className="brand-icon"><Music2 size={24}/></div><div><strong>BENGALURU <em>LIVE</em></strong><small>YOUR CITY. YOUR MUSIC.</small></div></a><nav className="desktop-nav" aria-label="Main navigation">{navMeta.map(x=><button className={tab===x.id?'selected':''} key={x.id} onClick={()=>{setTab(x.id);setMenu(false)}}><x.icon size={16}/>{label[x.id]}{x.id!=='discover'&&counts[x.id]>0&&<span className="nav-count">{counts[x.id]}</span>}</button>)}</nav><div className="header-right"><span className={'sync-dot '+(mode==='live'||mode==='client'?'online':'')}/><span className="sync-label">{mode==='live'||mode==='client'?'Live sheet':'Preview'}</span>{mode==='client'&&auth.authenticated&&<button className="refresh-btn logout-btn" onClick={()=>{clientLogout();void load()}} aria-label="Sign out" title="Sign out">Sign out</button>}<button className="refresh-btn" onClick={()=>void load()} aria-label="Refresh events" title="Refresh events"><RefreshCcw size={17} className={loading?'spinning':''}/></button><button className="mobile-menu" onClick={()=>setMenu(!menu)} aria-label="Toggle navigation"><Menu size={20}/></button></div></div>{menu&&<nav className="mobile-drawer">{navMeta.map(x=><button key={x.id} onClick={()=>{setTab(x.id);setMenu(false)}}>{label[x.id]} <span>{counts[x.id]}</span></button>)}</nav>}</header>
    <main>
      <section className="hero"><div className="hero-copy"><div className="eyebrow"><span className="line"/>A PERSONAL GUIDE TO LIVE MUSIC</div><h1>Find your next<br/><span>unforgettable</span> night.</h1><p>From quiet Sufi baithaks to roaring rock concerts. All the sounds of Bengaluru, curated in one place.</p><div className="hero-row"><div className="stat"><strong>{events.length}</strong><span>events tracked</span></div><div className="stat"><strong>{counts.wishlist}</strong><span>on your wishlist</span></div><div className="stat"><strong>{counts.not_interested}</strong><span>passed on</span></div></div></div><div className="hero-art" aria-hidden="true"><div className="sun-disc"/><div className="hero-record"><div className="record-label"><Music2 size={38}/><span>BLR 001</span></div></div><div className="floating-note">LIVE IN BENGALURU</div></div></section>
      <div className="page-wrap">
        {mode==='preview'&&<div className="notice preview-notice"><span><strong>Local preview:</strong> Events are a snapshot of the Google Sheet from 13 Oct 2026. Preferences are saved only in this browser until the backend is deployed.</span><a href={SHEET_URL} target="_blank" rel="noreferrer">Open live Sheet <ExternalLink size={13}/></a></div>}
        {checkingSession&&<div className="login-card"><Music2 size={32}/><h2>Restoring your Google session…</h2><p>Checking your existing sign-in and loading concerts.</p></div>}
        {authRequired&&(mode==='client'?<div className="login-card"><Music2 size={32}/><h2>Sign in to your concert collection</h2><p>Authorize your Google account to view events and save preferences in your existing private spreadsheet.</p><button className="primary-action" onClick={async()=>{try{await authorizeGoogleClient();await load()}catch(e){showMessage(e instanceof Error?e.message:'Sign-in failed')}}}>Continue with Google <ArrowRight size={16}/></button><p className="fineprint">Your short-lived Google session is saved in this tab to survive refreshes. It expires automatically; only the concert tracker is updated.</p></div>:<LoginGate onChange={()=>void load()}/>)}
        {!authRequired&&!checkingSession&&<>
          <div className="section-title"><div><div className="eyebrow subtle">YOUR CONCERT COLLECTION</div><h2>{tab==='discover'?'Explore the music':tab==='wishlist'?'Your wishlist':'Not interested'}</h2><p>{tab==='discover'?'Discover what’s playing around the city. Save what you love.':tab==='wishlist'?'All the shows you have your eye on, in one place.':'Concerts you passed on. Nothing is deleted; restore any time.'}</p></div><div className="view-count">{filtered.length} {filtered.length===1?'event':'events'}</div></div>
          <div className="toolbar"><label className="search-box"><Search size={19}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search artists, concerts, venues..." aria-label="Search concerts"/>{search&&<button aria-label="Clear search" onClick={()=>setSearch('')}><X size={15}/></button>}</label><label className="select-box"><CalendarDays size={17}/><select aria-label="Date range" value={dateFilter} onChange={e=>setDateFilter(e.target.value)}><option value="all">All dates</option><option value="week">Next 7 days</option><option value="month">This month</option></select><ChevronDown size={15}/></label><label className="select-box"><ArrowDownUp size={17}/><select aria-label="Sort events" value={sort} onChange={e=>setSort(e.target.value as Sort)}><option value="soonest">Soonest first</option><option value="relevance">Best match</option><option value="newest">Recently added</option></select><ChevronDown size={15}/></label></div>
          <div className="filters-row"><div className="genre-scroll"><SlidersHorizontal size={17} className="filter-icon"/>{genres.map(g=><button key={g} className={'genre-pill '+(g===genre?'active':'')} onClick={()=>setGenre(g)}>{g}</button>)}</div></div>
          <div className="list-settings"><label className="past-toggle"><input type="checkbox" checked={includePast} onChange={e=>setIncludePast(e.target.checked)}/><span>Include past events</span></label><span>{lastSync}</span></div>
          {filtered.length>0?<div className="event-grid">{filtered.map(e=><ConcertCard key={e.id} event={e} busy={busy===e.id} onPref={update} onDetail={x=>setDetailId(x.id)}/>)}</div>:<div className="empty-state"><div className="empty-icon">{tab==='wishlist'?<Heart size={31}/>:tab==='not_interested'?<EyeOff size={31}/>:<Search size={31}/>}</div><h3>{tab==='wishlist'?'Your wishlist is waiting':tab==='not_interested'?'Nothing dismissed yet':'No concerts found'}</h3><p>{tab==='wishlist'?'Save concerts from Discover and they will appear here.':tab==='not_interested'?'Events you mark as not interested will be here, ready to restore.':'Adjust your search, genre or date filters to see more concerts.'}</p><button onClick={()=>{setTab('discover');setSearch('');setGenre('All genres');setDateFilter('all')}}>Explore concerts <ArrowRight size={16}/></button></div>}
          <section className="bottom-callout"><div><span className="eyebrow">NEVER MISS A NOTE</span><h2>The city keeps playing.</h2><p>New concerts are researched every morning at 9 AM IST. Check back for new discoveries.</p></div><a href={SHEET_URL} target="_blank" rel="noopener noreferrer">View event database <ExternalLink size={17}/></a></section>
        </>}
      </div>
    </main>
    <footer><div className="footer-inner"><span><Music2 size={17}/> BENGALURU LIVE</span><span>Made for the music, not the noise.</span><a href={SHEET_URL} rel="noopener noreferrer" target="_blank">Google Sheets database <ExternalLink size={13}/></a></div></footer>
    {detail&&<DetailModal event={detail} onClose={()=>setDetailId(null)} onPref={update} busy={busy===detail.id}/>}
    {message&&<div role="alert" className="toast"><Sparkles size={16}/>{message}<button onClick={()=>setMessage('')}><X size={16}/></button></div>}
  </div>;
}
