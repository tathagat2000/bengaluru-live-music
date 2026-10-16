import type { Concert, InterestState, Tab } from './types';

export const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1liSjcztKGKxfuFisWGNK23YT_L0oQgq9IOQvZOp7XLc/edit';
export const PREF_KEY = 'bengaluru-live-preview-preferences-v1';
export const todayIST = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const niceDate = (date: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Date TBA';
  return new Intl.DateTimeFormat('en-IN',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(`${date}T12:00:00Z`));
};
export const dateParts = (date: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { day: '—', month: 'TBA', weekday: '' };
  const d = new Date(date+'T12:00:00Z');
  return { day: String(d.getUTCDate()).padStart(2,'0'), month: new Intl.DateTimeFormat('en-US',{month:'short',timeZone:'UTC'}).format(d).toUpperCase(), weekday: new Intl.DateTimeFormat('en-US',{weekday:'short',timeZone:'UTC'}).format(d) };
};
export const timeLabel = (time: string) => {
  if (!/^\d{2}:\d{2}$/.test(time)) return 'Time TBA';
  const [h,m] = time.split(':').map(Number);
  return `${h%12||12}${m?':'+String(m).padStart(2,'0'):''} ${h>=12?'PM':'AM'}`;
};
export const priceLabel = (e: Concert) => {
  if (/free/i.test(e.admissionType) || e.priceMin===0) return 'Free / RSVP';
  if (e.priceMin === null) return 'Price TBA';
  return `From ₹${e.priceMin.toLocaleString('en-IN')}`;
};
export const validUrl = (url: string) => { try { const u=new URL(url); return u.protocol==='https:'||u.protocol==='http:'?u.href:'' } catch { return '' } };
export const isPast = (date:string) => Boolean(date && date < todayIST());
export function getLocalPreferences(): Record<string,InterestState> {
  try { const item = JSON.parse(localStorage.getItem(PREF_KEY)||'{}'); return item && typeof item==='object' ? item : {}; } catch { return {}; }
}
export function saveLocalPreferences(prefs:Record<string,InterestState>) { localStorage.setItem(PREF_KEY,JSON.stringify(prefs)); }
export function applyTab(events: Concert[], tab: Tab):Concert[]{
  return events.filter(e => {
    if(tab==='discover') return e.preference!=='not_interested';
    if(tab==='wishlist') return e.preference==='wishlisted';
    return e.preference==='not_interested';
  });
}
export type DateFilter = 'upcoming'|'past'|'all'|'week'|'month'|'date';
export function matchesDateFilter(date:string,filter:DateFilter,today=todayIST()):boolean{
  if(filter==='all')return true;
  if(filter==='past')return Boolean(date)&&date<today;
  if(filter==='upcoming')return !date||date>=today;
  if(filter==='date')return true;
  if(filter==='week'){
    const end=new Date(`${today}T00:00:00Z`);end.setUTCDate(end.getUTCDate()+7);
    return date>=today&&date<=end.toISOString().slice(0,10);
  }
  return date.slice(0,7)===today.slice(0,7);
}
export function genreGroup(genre:string,sub=''):string {
  const x=(genre+' '+sub).toLowerCase();
  if(/hindustani|carnatic|classical/.test(x) && !/rock/.test(genre.toLowerCase())) return 'Classical';
  if(/sufi|qawwali|mystic|bhakti|devotional|ghazal|baul|kabir/.test(x)) return 'Sufi & Mystical';
  if(/rock|metal|tribute|grunge|punk/.test(x)) return 'Rock & Metal';
  if(/bollywood|pop/.test(x)) return 'Bollywood & Pop';
  if(/jazz|blues/.test(x)) return 'Jazz & Blues';
  if(/indie|fusion|folk|world/.test(x)) return 'Indie & Fusion';
  return 'Other';
}
export const genres=['All genres','Classical','Sufi & Mystical','Rock & Metal','Bollywood & Pop','Indie & Fusion','Jazz & Blues','Other'];
export const compareConcerts=(a:Concert,b:Concert)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time)||a.name.localeCompare(b.name);
