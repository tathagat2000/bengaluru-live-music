#!/usr/bin/env node
import { createHash, createSign } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const spreadsheetId = process.env.SPREADSHEET_ID || '1liSjcztKGKxfuFisWGNK23YT_L0oQgq9IOQvZOp7XLc';
const database = process.env.D1_DATABASE_NAME || 'bengaluru-live-preferences';
const service = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}');
if (!service.client_email || !service.private_key) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON must contain client_email and private_key');
const b64 = value => Buffer.from(value).toString('base64url');
const quote = value => value === null || value === undefined ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
const now = new Date().toISOString();

const getAccessToken = async () => {
  const issued = Math.floor(Date.now() / 1000);
  const head = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64(JSON.stringify({ iss: service.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets.readonly', aud: 'https://oauth2.googleapis.com/token', iat: issued, exp: issued + 3600 }));
  const signer = createSign('RSA-SHA256'); signer.update(`${head}.${body}`);
  const response = await fetch('https://oauth2.googleapis.com/token', { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:`${head}.${body}.${signer.sign(service.private_key,'base64url')}`}) });
  if (!response.ok) throw new Error(`Google token request failed: ${response.status}`);
  return (await response.json()).access_token;
};
const readRange = async (token, range) => {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`;
  const response = await fetch(url, { headers:{Authorization:`Bearer ${token}`} });
  if (!response.ok) throw new Error(`Google Sheets read failed for ${range}: ${response.status}`);
  return (await response.json()).values || [];
};
const rows = (matrix, required) => {
  if (!matrix.length) return [];
  const header = matrix[0];
  for (const name of required) if (!header.includes(name)) throw new Error(`Missing Sheet column: ${name}`);
  return matrix.slice(1).filter(row => row[0]).map(row => Object.fromEntries(header.map((name,index) => [name, String(row[index] || '').trim()])));
};
const num = value => value === '' ? null : Number(value);
const eventId = row => row.Event_ID || `legacy-${createHash('sha256').update(`${row.Event_Name}|${row.Start_Date}|${row.Venue}`).digest('hex').slice(0,16)}`;

const token = await getAccessToken();
const events = rows(await readRange(token, 'Events_Master!A1:AB'), ['Event_ID','Event_Name','Start_Date','Venue']);
const images = rows(await readRange(token, 'Event_Images!A1:H'), ['Event_ID','Image_URL','Source_Page_URL']);
const runId = `legacy-import-${Date.now()}`;
const eventSql = events.map(row => {
  const id = eventId(row);
  const values = [id,row.Event_Name,row.Artists,row.Primary_Genre,row.Subgenres,row.Event_Format,row.Tribute_To,row.Start_Date,row.Start_Time,row.End_DateTime,row.Venue,row.Area,row.Organizer,num(row.Price_Min_INR),num(row.Price_Max_INR),row.Admission_Type,row.Ticket_Status,row.Event_Status || 'upcoming',row.Booking_URL,row.Source_URLs,row.Source_Event_IDs,row.Relevance_Tier,row.Verification,row.First_Seen_At || now,row.First_Seen_Run_ID || runId,row.Last_Verified_At || now,row.Last_Changed_At,row.Notes,'music','[]','[]',now];
  return `INSERT INTO catalogue_events(event_id,event_name,artists,primary_genre,subgenres,event_format,tribute_to,start_date,start_time,end_datetime,venue,area,organizer,price_min_inr,price_max_inr,admission_type,ticket_status,event_status,booking_url,source_urls,source_event_ids,relevance_tier,verification,first_seen_at,first_seen_run_id,last_verified_at,last_changed_at,notes,event_category,uncertainty_json,evidence_json,updated_at) VALUES(${values.map(quote).join(',')}) ON CONFLICT(event_id) DO UPDATE SET event_name=excluded.event_name,artists=excluded.artists,primary_genre=excluded.primary_genre,subgenres=excluded.subgenres,event_format=excluded.event_format,tribute_to=excluded.tribute_to,start_date=excluded.start_date,start_time=excluded.start_time,end_datetime=excluded.end_datetime,venue=excluded.venue,area=excluded.area,organizer=excluded.organizer,price_min_inr=excluded.price_min_inr,price_max_inr=excluded.price_max_inr,admission_type=excluded.admission_type,ticket_status=excluded.ticket_status,event_status=excluded.event_status,booking_url=excluded.booking_url,source_urls=excluded.source_urls,source_event_ids=excluded.source_event_ids,relevance_tier=excluded.relevance_tier,verification=excluded.verification,last_verified_at=excluded.last_verified_at,last_changed_at=excluded.last_changed_at,notes=excluded.notes,updated_at=excluded.updated_at;`;
});
const imageSql = images.map(row => `INSERT OR IGNORE INTO catalogue_images(event_id,image_url,source_page_url,alt_text,image_type,image_order,verified_at_utc,notes) VALUES(${quote(row.Event_ID)},${quote(row.Image_URL)},${quote(row.Source_Page_URL)},${quote(row.Alt_Text)},${quote(row.Image_Type || 'poster')},${quote(Number(row.Image_Order)||1)},${quote(row.Verified_At_UTC || now)},${quote(row.Notes)});`);
const sql = [...eventSql, ...imageSql].join('\n');
console.log(JSON.stringify({ mode:process.argv.includes('--apply')?'apply':'dry-run', runId, events:events.length, images:images.length, sqlStatements:eventSql.length+imageSql.length }));
if (!process.argv.includes('--apply')) { console.log('Dry run only. Re-run with --apply after applying migration 0003 and validating counts.'); process.exit(0); }
const temp = await mkdtemp(join(tmpdir(),'bengaluru-live-catalogue-')); const file = join(temp,'catalogue.sql');
try {
  await writeFile(file, sql, { mode:0o600 });
  await new Promise((resolve,reject) => { const child = spawn('npx',['wrangler','d1','execute',database,'--remote','--file',file,'--yes'],{stdio:'inherit'}); child.on('error',reject); child.on('exit',code => code===0?resolve():reject(new Error(`Wrangler exited with ${code}`))); });
} finally { await rm(temp,{recursive:true,force:true}); }
