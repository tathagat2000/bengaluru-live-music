import { mediaFromRecords } from '../../src/media';
/* Cloudflare Pages Functions: shared, dependency-free Google Sheets and auth helpers. */
export interface Env {
  GOOGLE_CLIENT_ID?: string;
  ALLOWED_EMAILS?: string;
  DB?: {prepare:(sql:string)=>any};
  SPREADSHEET_ID?: string;
  GOOGLE_SERVICE_ACCOUNT_JSON?: string;
  SESSION_SECRET?: string;
}
export interface Context { request: Request; env: Env; params: Record<string,string>; }
export type Session={sub:string;email:string;exp:number};
type JWTPart=Record<string,unknown>;
const enc=new TextEncoder();
const encode=(s:string)=>btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const b64url=(raw:Uint8Array)=>btoa(Array.from(raw, x=>String.fromCharCode(x)).join('')).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unb64=(s:string)=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4)),x=>x.charCodeAt(0));
const decode=(s:string)=>JSON.parse(new TextDecoder().decode(unb64(s))) as JWTPart;
export const authorizedEmail=(email:string,env:Env)=>Boolean(env.ALLOWED_EMAILS?.split(',').some(x=>x.trim().toLowerCase()===email.toLowerCase()));
export const configured=(e:Env)=>Boolean(e.GOOGLE_CLIENT_ID&&e.ALLOWED_EMAILS&&e.SPREADSHEET_ID&&e.GOOGLE_SERVICE_ACCOUNT_JSON&&e.SESSION_SECRET&&e.DB);
export function json(data:unknown,status=200,extra?:HeadersInit){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',...(extra||{})}})}
export function safeOrigin(request:Request){const origin=request.headers.get('Origin');return !!origin && new URL(origin).origin===new URL(request.url).origin}
function signingKey(secret:string){return crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify'])}
export async function sessionCookie(session:Session,secret:string){const data=encode(JSON.stringify(session));const signature=b64url(new Uint8Array(await crypto.subtle.sign('HMAC',await signingKey(secret),enc.encode(data))));return `concert_session=${data}.${signature}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`}
export function clearCookie(){return 'concert_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'}
export async function readSession(req:Request,env:Env):Promise<Session|null>{if(!env.SESSION_SECRET)return null;const cookie=req.headers.get('Cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('concert_session='))?.slice(16);if(!cookie)return null;const [d,s]=cookie.split('.');if(!d||!s)return null;try{const valid=await crypto.subtle.verify('HMAC',await signingKey(env.SESSION_SECRET),unb64(s),enc.encode(d));if(!valid)return null;const ses=decode(d) as unknown as Session;if(!ses.sub||!ses.email||!ses.exp||ses.exp*1000<Date.now()||!authorizedEmail(ses.email,env))return null;return ses}catch{return null}}
let jwksCache:{expires:number;keys:JsonWebKey[]}|undefined;
async function jwks(){if(jwksCache&&jwksCache.expires>Date.now())return jwksCache.keys;const res=await fetch('https://www.googleapis.com/oauth2/v3/certs');if(!res.ok)throw Error('Google signing keys unavailable');const data=await res.json() as {keys:JsonWebKey[]};jwksCache={keys:data.keys,expires:Date.now()+1000*60*60};return data.keys}
export async function verifyGoogleToken(jwt:string,env:Env):Promise<{sub:string;email:string}>{
  const parts=jwt.split('.');if(parts.length!==3||jwt.length>12000)throw Error('Invalid ID token');
  const header=decode(parts[0]),claims=decode(parts[1]);if(header.alg!=='RS256'||typeof header.kid!=='string')throw Error('Invalid ID token algorithm');
  const keys=await jwks();const jwk=keys.find(x=>(x as JsonWebKey & {kid?:string}).kid===header.kid&&x.kty==='RSA');if(!jwk)throw Error('Unknown Google signing key');
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  const ok=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,unb64(parts[2]),enc.encode(`${parts[0]}.${parts[1]}`));
  const now=Math.floor(Date.now()/1000);
  if(!ok||!['accounts.google.com','https://accounts.google.com'].includes(String(claims.iss))||claims.aud!==env.GOOGLE_CLIENT_ID||typeof claims.exp!=='number'||claims.exp<=now||typeof claims.iat!=='number'||claims.iat>now+60||claims.email_verified!==true||typeof claims.email!=='string'||typeof claims.sub!=='string'||!authorizedEmail(claims.email,env))throw Error('This Google account is not authorized');
  return {sub:claims.sub,email:claims.email};
}
function pemBytes(pem:string){const base64=pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,'');return unb64(base64.replace(/\+/g,'-').replace(/\//g,'_'))}
let serviceToken:{value:string;exp:number}|undefined;
async function accessToken(env:Env){
  if(serviceToken&&serviceToken.exp>Date.now()+60000)return serviceToken.value;
  if(!env.GOOGLE_SERVICE_ACCOUNT_JSON)throw Error('Google service account not configured');
  const service=JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON) as {client_email:string;private_key:string;token_uri?:string};
  if(!service.client_email||!service.private_key)throw Error('Missing service account credentials');
  const now=Math.floor(Date.now()/1000),head=encode(JSON.stringify({alg:'RS256',typ:'JWT'})),body=encode(JSON.stringify({iss:service.client_email,scope:'https://www.googleapis.com/auth/spreadsheets',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3300}));
  const key=await crypto.subtle.importKey('pkcs8',pemBytes(service.private_key),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  const sig=b64url(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,enc.encode(`${head}.${body}`))));
  const result=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:`${head}.${body}.${sig}`})});
  if(!result.ok)throw Error('Google Sheets service account authorization failed');const obj=await result.json() as {access_token:string;expires_in:number};
  serviceToken={value:obj.access_token,exp:Date.now()+obj.expires_in*1000};return obj.access_token;
}
function sheetUrl(env:Env,path:string){return `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.SPREADSHEET_ID||'')}${path}`}
export async function readRanges(env:Env,ranges:string[]):Promise<string[][][]>{
  const p=new URLSearchParams({valueRenderOption:'FORMATTED_VALUE'});ranges.forEach(x=>p.append('ranges',x));
  const res=await fetch(sheetUrl(env,`/values:batchGet?${p}`),{headers:{Authorization:`Bearer ${await accessToken(env)}`}});
  if(!res.ok)throw Error(`Google Sheets read failed: ${res.status}`);
  const data=await res.json() as {valueRanges:{values?:string[][]}[]};return data.valueRanges.map(x=>x.values||[]);
}
export async function appendPreference(env:Env,fields:string[]){
  const p=new URLSearchParams({valueInputOption:'RAW',insertDataOption:'INSERT_ROWS'});
  const res=await fetch(sheetUrl(env,`/values/${encodeURIComponent('User_Preferences!A:F')}:append?${p}`),{method:'POST',headers:{Authorization:`Bearer ${await accessToken(env)}`,'Content-Type':'application/json'},body:JSON.stringify({values:[fields]})});
  if(!res.ok)throw Error(`Google Sheets preference write failed: ${res.status}`);
  return res.json();
}
export function parseRecords(matrix:string[][]){if(!matrix.length)return [];const header=matrix[0];return matrix.slice(1).filter(r=>r[0]).map(row=>Object.fromEntries(header.map((name,i)=>[name,row[i]||''])) as Record<string,string>)}
const n=(s:string)=>s?.trim()!==''&&Number.isFinite(Number(s))?Number(s):null;
export function eventFromRecord(r:Record<string,string>,preference:string,images:ReturnType<typeof mediaFromRecords>[string]=[]){
  return {id:r.Event_ID,name:r.Event_Name,artists:r.Artists,images,genre:r.Primary_Genre,subgenres:(r.Subgenres||'').split(';').map(x=>x.trim()).filter(Boolean),format:r.Event_Format,tributeTo:r.Tribute_To,date:r.Start_Date,time:r.Start_Time,venue:r.Venue,area:r.Area,organizer:r.Organizer,priceMin:n(r.Price_Min_INR),priceMax:n(r.Price_Max_INR),admissionType:r.Admission_Type,ticketStatus:r.Ticket_Status,eventStatus:r.Event_Status,bookingUrl:r.Booking_URL,sourceUrl:(r.Source_URLs||'').split(/[,;\n]/)[0]||'',relevance:r.Relevance_Tier,verification:r.Verification,firstSeen:r.First_Seen_At,lastVerified:r.Last_Verified_At,notes:r.Notes,preference:preference||'neutral'};
}
export function latestStates(preferences:Record<string,string>[],sub:string){const result:Record<string,string>={};for(const r of preferences){if(r.User_ID===sub&&['neutral','wishlisted','not_interested'].includes(r.New_State))result[r.Event_ID]=r.New_State;}return result;}
