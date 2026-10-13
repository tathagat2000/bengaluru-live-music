import type { Concert, InterestState } from './types';
import { mediaFromRecords } from './media';

/** Optional zero-backend mode for static GitHub Pages hosting. Tokens stay in memory. */
const SPREADSHEET_ID='1liSjcztKGKxfuFisWGNK23YT_L0oQgq9IOQvZOp7XLc';
const ALLOWED_EMAIL='tathagat2001@gmail.com';
let token='';let ownerSub='';let ownerEmail='';
const rawUrl=`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values`;
export const clientSheetsEnabled=()=>import.meta.env.VITE_CLIENT_SHEETS==='true'&&Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);
export const clientSignedIn=()=>Boolean(token&&ownerSub);
export const clientAccount=()=>ownerEmail;
export async function authorizeGoogleClient():Promise<void>{
  const api=window.google?.accounts?.oauth2;
  if(!api)throw Error('Google Identity Services has not loaded. Check your network connection.');
  const res=await new Promise<{access_token?:string,error?:string}>((resolve,reject)=>{
    try{const client=api.initTokenClient({client_id:import.meta.env.VITE_GOOGLE_CLIENT_ID,scope:'https://www.googleapis.com/auth/spreadsheets openid email profile',callback:resolve,error_callback:(error:unknown)=>reject(Error('Google authentication was cancelled or blocked: '+JSON.stringify(error)))});client.requestAccessToken({prompt:'consent'});}catch(e){reject(e)}
  });
  if(!res.access_token)throw Error(res.error||'Google authentication failed');
  const user=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:`Bearer ${res.access_token}`}});
  if(!user.ok)throw Error('Could not verify signed-in Google account');
  const claims=await user.json() as {email?:string;email_verified?:boolean;sub?:string};
  if(claims.email?.toLowerCase()!==ALLOWED_EMAIL||!claims.email_verified||!claims.sub){
    window.google?.accounts?.oauth2?.revoke(res.access_token,()=>{});
    throw Error('This site is restricted to the Google account that owns the concert tracker.');
  }
  token=res.access_token;ownerSub=claims.sub;ownerEmail=claims.email;
}
export function clientLogout(){if(token){try{window.google?.accounts?.oauth2?.revoke(token,()=>{})}catch{}}token='';ownerEmail='';ownerSub=''}
async function googleFetch(url:string,options:RequestInit={}){
  if(!token||!ownerSub)throw Error('Google sign-in required');
  const result=await fetch(url,{...options,headers:{Authorization:`Bearer ${token}`,...(options.headers as Record<string,string>||{})}});
  if(result.status===401){clientLogout();throw Error('Google access expired. Sign in again.')}
  if(!result.ok){const body=await result.json().catch(()=>({error:{message:'Request failed'}})) as {error?:{message?:string}};throw Error(body.error?.message||`Google Sheets error ${result.status}`)}
  return result.json();
}
async function readRanges(ranges:string[]):Promise<string[][][]>{
  const query=new URLSearchParams({valueRenderOption:'FORMATTED_VALUE'});
  ranges.forEach(range=>query.append('ranges',range));
  const obj=await googleFetch(`${rawUrl}:batchGet?${query}`) as {valueRanges:Array<{values?:string[][]}>};
  return obj.valueRanges.map(r=>r.values||[]);
}
function records(matrix:string[][]):Record<string,string>[]{const [head,...rows]=matrix;if(!head)return [];return rows.filter(r=>r[0]).map(r=>Object.fromEntries(head.map((h,i)=>[h,r[i]||''])))}
const number=(x:string)=>x!==''&&x!=null&&!isNaN(Number(x))?Number(x):null;
export async function getGoogleClientEvents():Promise<Concert[]>{
  const [master,prefs,mediaRows]=await readRanges(['Events_Master!A1:AB','User_Preferences!A1:F','Event_Images!A1:H']);
  const media=mediaFromRecords(records(mediaRows));
  const status:Record<string,InterestState>={};
  for(const p of records(prefs)){if(p.User_ID===ownerSub&&['neutral','wishlisted','not_interested'].includes(p.New_State))status[p.Event_ID]=p.New_State as InterestState}
  return records(master).map(x=>({id:x.Event_ID,name:x.Event_Name,artists:x.Artists,genre:x.Primary_Genre,images:media[x.Event_ID]||[],subgenres:(x.Subgenres||'').split(';').map(t=>t.trim()).filter(Boolean),format:x.Event_Format,tributeTo:x.Tribute_To||'',date:x.Start_Date,time:x.Start_Time||'',venue:x.Venue,area:x.Area,organizer:x.Organizer||'',priceMin:number(x.Price_Min_INR),priceMax:number(x.Price_Max_INR),admissionType:x.Admission_Type||'',ticketStatus:x.Ticket_Status||'',eventStatus:x.Event_Status||'',bookingUrl:x.Booking_URL||'',sourceUrl:(x.Source_URLs||'').split(/[,;\n]/)[0]||'',relevance:x.Relevance_Tier,verification:x.Verification,firstSeen:x.First_Seen_At||'',lastVerified:x.Last_Verified_At||'',notes:x.Notes||'',preference:status[x.Event_ID]||'neutral'}));
}
export async function setGoogleClientPreference(id:string,state:InterestState,requestId:string){
  if(!clientSignedIn())throw Error('Sign in again to save preferences');
  if(!['neutral','wishlisted','not_interested'].includes(state))throw Error('Invalid preference');
  const [master,log]=await readRanges(['Events_Master!A1:A','User_Preferences!A1:F']);
  if(!master.slice(1).some(x=>x[0]===id))throw Error('Event no longer exists');
  const duplicate=records(log).find(r=>r.Client_Request_ID===requestId&&r.User_ID===ownerSub);
  if(duplicate){if(duplicate.Event_ID!==id||duplicate.New_State!==state)throw Error('Request ID conflict');return state}
  const query=new URLSearchParams({valueInputOption:'RAW',insertDataOption:'INSERT_ROWS'});
  await googleFetch(`${rawUrl}/${encodeURIComponent('User_Preferences!A:F')}:append?${query}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({values:[[crypto.randomUUID(),id,ownerSub,state,new Date().toISOString(),requestId]]})});
  return state;
}
export interface OAuthAPI {initTokenClient:(options:{client_id:string;scope:string;callback:(res:{access_token?:string;error?:string})=>void;error_callback:(err:unknown)=>void})=>{requestAccessToken:(options:{prompt:string})=>void};revoke:(token:string,cb:()=>void)=>void}
declare global {interface Window {google?:{accounts?:{oauth2?:OAuthAPI;id?:{initialize:(x:unknown)=>void,renderButton:(node:HTMLElement,x:unknown)=>void}}}}}
