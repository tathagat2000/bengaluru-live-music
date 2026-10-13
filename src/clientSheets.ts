import type { Concert, InterestState } from './types';
import { mediaFromRecords } from './media';

/**
 * Personal GitHub Pages mode. Keep an access token in per-tab sessionStorage
 * so a normal page refresh won't ask for OAuth again. This is a short-lived
 * convenience cache, NOT a long-lived session or a replacement for a backend.
 * Any same-origin JavaScript (including XSS) can access sessionStorage.
 */
const SPREADSHEET_ID='1liSjcztKGKxfuFisWGNK23YT_L0oQgq9IOQvZOp7XLc';
const ALLOWED_EMAIL='tathagat2001@gmail.com';
const CLIENT_ID=import.meta.env.VITE_GOOGLE_CLIENT_ID||'';
const CACHE_KEY='bengaluru-live-google-session-v1';
const EXPIRY_BUFFER_MS=60_000;
type CachedSession={accessToken:string; expiresAt:number; clientId:string};
type OwnerClaims={email?:string;email_verified?:boolean;sub?:string};
let token='';let ownerSub='';let ownerEmail='';let expiresAt=0;
let pendingRestore:Promise<boolean>|undefined;
let sessionEpoch=0;
const rawUrl=`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values`;
export const clientSheetsEnabled=()=>import.meta.env.VITE_CLIENT_SHEETS==='true'&&Boolean(CLIENT_ID);
export const clientSignedIn=()=>Boolean(token&&ownerSub&&Date.now()+EXPIRY_BUFFER_MS<expiresAt);
export const clientAccount=()=>ownerEmail;

function clearSession(){
  sessionEpoch++;
  token='';ownerSub='';ownerEmail='';expiresAt=0;
  try{window.sessionStorage.removeItem(CACHE_KEY)}catch{/* Storage might be disabled. */}
}
function cacheSession(){
  try{
    window.sessionStorage.setItem(CACHE_KEY,JSON.stringify({
      accessToken:token,expiresAt,clientId:CLIENT_ID,
    } satisfies CachedSession));
  }catch{/* If storage is unavailable, regular in-memory login still works. */}
}
async function verifyOwner(accessToken:string):Promise<Required<OwnerClaims>>{
  const user=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{
    headers:{Authorization:`Bearer ${accessToken}`},
  });
  if(!user.ok)throw Error('Could not verify signed-in Google account');
  const claims=await user.json() as OwnerClaims;
  if(claims.email?.toLowerCase()!==ALLOWED_EMAIL||!claims.email_verified||!claims.sub){
    throw Error('This site is restricted to the Google account that owns the concert tracker.');
  }
  return claims as Required<OwnerClaims>;
}

/** Restore only a still-valid cached token, and reverify the Google identity. */
export async function restoreGoogleClient():Promise<boolean>{
  if(clientSignedIn())return true;
  if(pendingRestore)return pendingRestore;
  const epoch=sessionEpoch;
  pendingRestore=(async()=>{
    let raw:string|null=null;
    try{raw=window.sessionStorage.getItem(CACHE_KEY)}catch{return false}
    if(!raw)return false;
    let session:CachedSession;
    try{session=JSON.parse(raw) as CachedSession}catch{clearSession();return false}
    if(!session||typeof session.accessToken!=='string'||!session.accessToken||
       session.clientId!==CLIENT_ID||!Number.isFinite(session.expiresAt)||
       session.expiresAt<=Date.now()+EXPIRY_BUFFER_MS){
      clearSession();return false;
    }
    try{
      const claims=await verifyOwner(session.accessToken);
      if(epoch!==sessionEpoch)return false; // Ignore restores completed after sign-out.
      token=session.accessToken;ownerSub=claims.sub;ownerEmail=claims.email;expiresAt=session.expiresAt;
      return true;
    }catch{
      if(epoch===sessionEpoch)clearSession();
      return false;
    }
  })();
  try{return await pendingRestore}finally{pendingRestore=undefined}
}

export async function authorizeGoogleClient():Promise<void>{
  const api=window.google?.accounts?.oauth2;
  if(!api)throw Error('Google Identity Services has not loaded. Check your network connection.');
  const res=await new Promise<{access_token?:string;expires_in?:number|string;error?:string}>((resolve,reject)=>{
    try{
      const client=api.initTokenClient({
        client_id:CLIENT_ID,
        scope:'https://www.googleapis.com/auth/spreadsheets openid email profile',
        callback:resolve,
        error_callback:(error:unknown)=>reject(Error('Google authentication was cancelled or blocked: '+JSON.stringify(error))),
      });
      client.requestAccessToken({prompt:'consent'});
    }catch(e){reject(e)}
  });
  if(!res.access_token)throw Error(res.error||'Google authentication failed');
  let claims:Required<OwnerClaims>;
  try{claims=await verifyOwner(res.access_token)}
  catch(e){
    window.google?.accounts?.oauth2?.revoke(res.access_token,()=>{});
    throw e;
  }
  const tokenLifetime=Number(res.expires_in);
  // Google token responses include expires_in. Cap to 1 hour and fail closed if absent.
  const ttlSeconds=Number.isFinite(tokenLifetime)&&tokenLifetime>0?Math.min(tokenLifetime,3600):3000;
  clearSession();
  token=res.access_token;ownerSub=claims.sub;ownerEmail=claims.email;
  expiresAt=Date.now()+ttlSeconds*1000;
  cacheSession();
}
export function clientLogout(){
  const accessToken=token;
  clearSession();
  if(accessToken){try{window.google?.accounts?.oauth2?.revoke(accessToken,()=>{})}catch{/* Already cleared. */}}
}
async function googleFetch(url:string,options:RequestInit={}){
  if(!token||!ownerSub)throw Error('Google sign-in required');
  const result=await fetch(url,{...options,headers:{Authorization:`Bearer ${token}`,...(options.headers as Record<string,string>||{})}});
  if(result.status===401){clearSession();throw Error('Google access expired. Sign in again.')}
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
export interface OAuthAPI {initTokenClient:(options:{client_id:string;scope:string;callback:(res:{access_token?:string;expires_in?:number|string;error?:string})=>void;error_callback:(err:unknown)=>void})=>{requestAccessToken:(options:{prompt:string})=>void};revoke:(token:string,cb:()=>void)=>void}
declare global {interface Window {google?:{accounts?:{oauth2?:OAuthAPI;id?:{initialize:(x:unknown)=>void,renderButton:(node:HTMLElement,x:unknown)=>void}}}}}
