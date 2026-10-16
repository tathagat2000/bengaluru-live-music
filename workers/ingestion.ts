/// <reference types="@cloudflare/workers-types" />
import { WorkflowEntrypoint } from 'cloudflare:workers';
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import { categoryFor, isBengaluru, parseJsonLd } from './normalize';

type Source = { source_id:string; name:string; source_url:string; source_type:string };
type Candidate = {
  candidateId:string; sourceId:string; eventId:string; eventName:string; artists:string; eventCategory:string;
  primaryGenre:string; subgenres:string[]; eventFormat:string; tributeTo?:string; relevanceTier?:string; verification?:string; startDate:string; startTime:string; endDateTime:string;
  venue:string; area:string; organizer:string; priceMinInr:number|null; priceMaxInr:number|null; admissionType:string;
  ticketStatus:string; eventStatus:string; bookingUrl:string; sourceUrl:string; sourceEventId:string; imageUrl:string;
  imageAlt:string; evidence:string[]; uncertainty:string[];
};
type IngestionEnv = {
  DB:D1Database; EVIDENCE_BUCKET?:R2Bucket; SOURCE_QUEUE?:Queue<SourceMessage>;
  GITHUB_DISPATCH_TOKEN?:string; GITHUB_REPOSITORY?:string; REVIEW_CALLBACK_URL?:string;
  INGESTION_SHARED_SECRET?:string; SOURCE_USER_AGENT?:string; EVENT_INGESTION?:{create:(options?:{id?:string;params?:{runId?:string}})=>Promise<{id:string}>};
};
type SourceMessage = { runId:string; source:Source };
type ReviewResponse = { candidateId:string; decision:'publish'|'merge'|'reject'|'hold'; fields?:Partial<Candidate>; uncertainty?:string[]; evidenceGaps?:string[]; reason?:string };

const headers = {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const json = (value:unknown,status=200) => new Response(JSON.stringify(value),{status,headers});
const now = () => new Date().toISOString();
const clean = (value:unknown) => value == null ? '' : String(value).trim();
const sha256 = async (value:string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const idFor = async (value:string) => `evt-${(await sha256(value)).slice(0,20)}`;
const isHttps = (value:string) => { try { const url=new URL(value); return url.protocol==='https:'&&!url.username&&!url.password; } catch { return false; } };
function meta(html:string,name:string) { const match=html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']*)["']`,`i`)); return match?.[1]||''; }
function isoParts(value:string) { const date=new Date(value); if(!Number.isFinite(date.getTime())) return {date:'',time:''}; return {date:date.toISOString().slice(0,10),time:date.toISOString().slice(11,16)}; }
function locationOf(item:Record<string,unknown>) { const location=item.location as Record<string,unknown>|undefined; if(typeof location==='string')return {venue:location,area:location}; return {venue:clean(location?.name),area:clean((location?.address as Record<string,unknown>|undefined)?.addressLocality||location?.address)}; }
function imageOf(item:Record<string,unknown>) { const image=item.image; return Array.isArray(image)?clean(image[0]):clean(image); }

async function candidatesFrom(source:Source,html:string):Promise<Candidate[]> {
  const result:Candidate[]=[];
  for(const item of parseJsonLd(html)) {
    const location=locationOf(item); const parts=isoParts(clean(item.startDate));
    const sourceUrl=clean(item.url)||source.source_url; const name=clean(item.name);
    if(!name||!parts.date||!location.venue||!isBengaluru(`${location.venue} ${location.area}`)||!isHttps(sourceUrl)) continue;
    const eventId=await idFor(`${source.source_id}|${clean(item.identifier)}|${name}|${parts.date}|${location.venue}`);
    result.push({candidateId:`${source.source_id}-${eventId}`,sourceId:source.source_id,eventId,eventName:name,artists:clean((item.performer as Record<string,unknown>|undefined)?.name||item.performer),eventCategory:categoryFor(clean(item['@type']),name),primaryGenre:'',subgenres:[],eventFormat:clean(item['@type']),startDate:parts.date,startTime:parts.time,endDateTime:clean(item.endDate),venue:location.venue,area:location.area,organizer:clean((item.organizer as Record<string,unknown>|undefined)?.name||item.organizer),priceMinInr:null,priceMaxInr:null,admissionType:'',ticketStatus:'',eventStatus:'upcoming',bookingUrl:sourceUrl,sourceUrl,sourceEventId:clean(item.identifier),imageUrl:isHttps(imageOf(item))?imageOf(item):'',imageAlt:name,evidence:[sourceUrl],uncertainty:['genre','price','ticket_status'],});
  }
  if(result.length===0) {
    const name=meta(html,'og:title')||meta(html,'twitter:title'); const sourceUrl=source.source_url;
    if(name&&isHttps(sourceUrl)) { const parts=isoParts(meta(html,'event:start_time')); const venue=meta(html,'event:venue'); if(parts.date&&venue&&isBengaluru(`${venue} ${name}`)) { const eventId=await idFor(`${source.source_id}|${name}|${parts.date}|${venue}`); result.push({candidateId:`${source.source_id}-${eventId}`,sourceId:source.source_id,eventId,eventName:name,artists:'',eventCategory:categoryFor('',name),primaryGenre:'',subgenres:[],eventFormat:'',startDate:parts.date,startTime:parts.time,endDateTime:'',venue,area:venue,organizer:'',priceMinInr:null,priceMaxInr:null,admissionType:'',ticketStatus:'',eventStatus:'upcoming',bookingUrl:sourceUrl,sourceUrl,sourceEventId:'',imageUrl:isHttps(meta(html,'og:image'))?meta(html,'og:image'):'',imageAlt:name,evidence:[sourceUrl],uncertainty:['artists','genre','price','ticket_status']}); } }
  }
  return result;
}

async function fetchSource(env:IngestionEnv,runId:string,source:Source) {
  const fetched=now(); let status='success'; let httpStatus:number|null=null; let error=''; let body=''; let candidates:Candidate[]=[];
  try { const response=await fetch(source.source_url,{headers:{Accept:'text/html,application/xhtml+xml,application/json', 'User-Agent':env.SOURCE_USER_AGENT||'BengaluruLiveDiscovery/1.0 (+https://bengaluru-live-music.pages.dev)'}}); httpStatus=response.status; if(!response.ok)throw Error(`HTTP ${response.status}`); body=await response.text(); candidates=await candidatesFrom(source,body); }
  catch(cause) { status='failed'; error=cause instanceof Error?cause.message:'Fetch failed'; }
  const contentHash=body?await sha256(body):''; const snapshotKey=`ingestion/${runId}/${source.source_id}/${contentHash||'failed'}.html`;
  if(body&&env.EVIDENCE_BUCKET) await env.EVIDENCE_BUCKET.put(snapshotKey,body,{httpMetadata:{contentType:'text/html; charset=utf-8'}});
  const statements=[env.DB.prepare('INSERT OR REPLACE INTO ingestion_fetches(run_id,source_id,fetched_at,status,http_status,content_hash,snapshot_key,candidate_count,error) VALUES(?,?,?,?,?,?,?,?,?)').bind(runId,source.source_id,fetched,status,httpStatus,contentHash,body?snapshotKey:'',candidates.length,error),env.DB.prepare('UPDATE ingestion_sources SET last_checked_at=?,last_status=?,last_error=?,updated_at=? WHERE source_id=?').bind(fetched,status,error,fetched,source.source_id)];
  for(const candidate of candidates) statements.push(env.DB.prepare('INSERT OR REPLACE INTO ingestion_candidates(candidate_id,run_id,source_id,payload_json,status,review_batch_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').bind(candidate.candidateId,runId,source.source_id,JSON.stringify(candidate),'pending','',fetched,fetched));
  statements.push(env.DB.prepare('UPDATE ingestion_runs SET completed_sources=completed_sources+1,candidates_found=candidates_found+?,source_failures=source_failures+? WHERE run_id=?').bind(candidates.length,status==='failed'?1:0,runId));
  await env.DB.batch(statements);
}

async function dispatchReview(env:IngestionEnv,runId:string,batchId:string) {
  if(!env.GITHUB_DISPATCH_TOKEN||!env.GITHUB_REPOSITORY) return false;
  const response=await fetch(`https://api.github.com/repos/${env.GITHUB_REPOSITORY}/dispatches`,{method:'POST',headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${env.GITHUB_DISPATCH_TOKEN}`,'Content-Type':'application/json','User-Agent':'bengaluru-live-ingestion'},body:JSON.stringify({event_type:'bengaluru-review',client_payload:{runId,batchId}})});
  if(!response.ok) throw Error(`GitHub review dispatch failed: ${response.status}`); return true;
}

async function maybeCreateReview(env:IngestionEnv,runId:string) {
  const run=await env.DB.prepare('SELECT expected_sources,completed_sources FROM ingestion_runs WHERE run_id=?').bind(runId).first<{expected_sources:number;completed_sources:number}>();
  if(!run||run.completed_sources<run.expected_sources)return;
  const batchId=`review-${runId}`; await env.DB.prepare('INSERT OR IGNORE INTO review_batches(batch_id,run_id,status,created_at) VALUES(?,?,?,?)').bind(batchId,runId,'pending',now()).run();
  const claimed=await env.DB.prepare("UPDATE review_batches SET status='dispatching' WHERE batch_id=? AND status='pending' RETURNING batch_id").bind(batchId).first<{batch_id:string}>();
  if(!claimed)return;
  try { await dispatchReview(env,runId,batchId); await env.DB.prepare("UPDATE review_batches SET status='dispatched' WHERE batch_id=? AND status='dispatching'").bind(batchId).run(); await env.DB.prepare("UPDATE ingestion_runs SET status='awaiting_review' WHERE run_id=? AND status='running'").bind(runId).run(); }
  catch(cause) { await env.DB.prepare("UPDATE review_batches SET status='failed',error=? WHERE batch_id=?").bind(cause instanceof Error?cause.message:'Dispatch failed',batchId).run(); await env.DB.prepare("UPDATE ingestion_runs SET status='failed',error=? WHERE run_id=?").bind(cause instanceof Error?cause.message:'Dispatch failed',runId).run(); }
}

async function startRun(env:IngestionEnv,runId=`run-${new Date().toISOString().replace(/[^0-9]/g,'').slice(0,14)}-${crypto.randomUUID().slice(0,8)}`) {
  const started=now();
  const sources=(await env.DB.prepare('SELECT source_id,name,source_url,source_type FROM ingestion_sources WHERE enabled=1 ORDER BY source_id').all<Source>()).results;
  await env.DB.prepare('INSERT INTO ingestion_runs(run_id,started_at,status,expected_sources) VALUES(?,?,?,?)').bind(runId,started,'running',sources.length).run();
  if(env.SOURCE_QUEUE) for(const source of sources) await env.SOURCE_QUEUE.send({runId,source});
  else { await Promise.all(sources.map(source=>fetchSource(env,runId,source))); await maybeCreateReview(env,runId); }
  return runId;
}

export class EventIngestionWorkflow extends WorkflowEntrypoint<IngestionEnv,{runId?:string}> {
  async run(event:WorkflowEvent<{runId?:string}>,step:WorkflowStep) {
    const runId=event.payload?.runId||`run-${new Date().toISOString().replace(/[^0-9]/g,'').slice(0,14)}-${crypto.randomUUID().slice(0,8)}`;
    await step.do('initialize source fanout',{retries:{limit:3,delay:'10 seconds',backoff:'exponential'}},async()=>{await startRun(this.env,runId);return {runId};});
    return {runId};
  }
}

async function reviewBatch(env:IngestionEnv,request:Request) {
  if(request.headers.get('Authorization')!==`Bearer ${env.INGESTION_SHARED_SECRET}`)return json({error:'Unauthorized'},401);
  const url=new URL(request.url); const runId=url.searchParams.get('runId')||''; if(!runId)return json({error:'runId required'},400);
  const rows=(await env.DB.prepare("SELECT candidate_id,payload_json FROM ingestion_candidates WHERE run_id=? AND status='pending'").bind(runId).all<{candidate_id:string;payload_json:string}>()).results;
  return json({runId,batchId:`review-${runId}`,candidates:rows.map(row=>JSON.parse(row.payload_json))});
}

async function applyReview(env:IngestionEnv,request:Request) {
  if(request.headers.get('Authorization')!==`Bearer ${env.INGESTION_SHARED_SECRET}`)return json({error:'Unauthorized'},401);
  const body=await request.json() as {batchId?:string;runId?:string;reviews?:ReviewResponse[];error?:string}; const batchId=clean(body.batchId); const runId=clean(body.runId); const reviews=Array.isArray(body.reviews)?body.reviews:[];
  if(!batchId||!runId)return json({error:'batchId and runId required'},400);
  if(body.error) { await env.DB.batch([env.DB.prepare("UPDATE review_batches SET status='failed',completed_at=?,error=? WHERE batch_id=?").bind(now(),body.error,batchId),env.DB.prepare("UPDATE ingestion_runs SET status='failed',finished_at=?,error=? WHERE run_id=?").bind(now(),body.error,runId)]); return json({ok:false,runId,error:body.error},202); }
  const statements: D1PreparedStatement[]=[]; let published=0; let changed=0;
  for(const review of reviews) {
    const candidateRow=await env.DB.prepare('SELECT payload_json FROM ingestion_candidates WHERE candidate_id=? AND run_id=?').bind(review.candidateId,runId).first<{payload_json:string}>(); if(!candidateRow)continue;
    const base=JSON.parse(candidateRow.payload_json) as Candidate;
    const allowedFields=['eventName','artists','eventCategory','primaryGenre','subgenres','eventFormat','startDate','startTime','endDateTime','venue','area','organizer','priceMinInr','priceMaxInr','admissionType','ticketStatus','eventStatus','bookingUrl','imageUrl','imageAlt','uncertainty'] as const;
    const overrides=Object.fromEntries(allowedFields.filter(field=>review.fields&&field in review.fields).map(field=>[field,review.fields?.[field]]));
    const candidate={...base,...overrides};
    const valid=Boolean(candidate.eventName&&/^\d{4}-\d{2}-\d{2}$/.test(candidate.startDate)&&candidate.venue&&isBengaluru(`${candidate.venue} ${candidate.area}`)&&isHttps(candidate.sourceUrl)&&candidate.eventCategory&&Array.isArray(candidate.evidence)&&candidate.evidence.some(isHttps));
    const finalStatus=review.decision==='reject'?'rejected':valid&&['publish','merge'].includes(review.decision)?'published':'held';
    if(finalStatus==='published') { const timestamp=now(); const previous=await env.DB.prepare('SELECT * FROM catalogue_events WHERE event_id=?').bind(candidate.eventId).first<Record<string,unknown>>(); const fields=['event_name','artists','primary_genre','subgenres','event_format','start_date','start_time','end_datetime','venue','area','organizer','price_min_inr','price_max_inr','admission_type','ticket_status','event_status','booking_url','source_urls','source_event_ids','relevance_tier','verification','first_seen_at','first_seen_run_id','last_verified_at','last_changed_at','notes','event_category','uncertainty_json','evidence_json','updated_at']; const values=[candidate.eventId,candidate.eventName,candidate.artists,candidate.primaryGenre,candidate.subgenres.join('; '),candidate.eventFormat,candidate.tributeTo||'',candidate.startDate,candidate.startTime,candidate.endDateTime,candidate.venue,candidate.area,candidate.organizer,candidate.priceMinInr,candidate.priceMaxInr,candidate.admissionType,candidate.ticketStatus,candidate.eventStatus,candidate.bookingUrl,candidate.sourceUrl,candidate.sourceEventId,candidate.relevanceTier||'B',candidate.verification||'source_verified',previous?.first_seen_at||timestamp,previous?.first_seen_run_id||runId,timestamp,previous?timestamp:'',review.reason||'',candidate.eventCategory,JSON.stringify(review.uncertainty||candidate.uncertainty||[]),JSON.stringify(candidate.evidence||[]),timestamp];
      statements.push(env.DB.prepare(`INSERT INTO catalogue_events(event_id,${fields.join(',')}) VALUES(?,${fields.map(()=>'?').join(',')}) ON CONFLICT(event_id) DO UPDATE SET ${fields.filter(field=>field!=='first_seen_at'&&field!=='first_seen_run_id').map(field=>`${field}=excluded.${field}`).join(',')}`).bind(...values));
      if(candidate.imageUrl&&isHttps(candidate.imageUrl)) statements.push(env.DB.prepare('INSERT OR IGNORE INTO catalogue_images(event_id,image_url,source_page_url,alt_text,image_type,image_order,verified_at_utc,notes) VALUES(?,?,?,?,?,?,?,?)').bind(candidate.eventId,candidate.imageUrl,candidate.sourceUrl,candidate.imageAlt||candidate.eventName,'poster',1,timestamp,'Extracted from source event evidence'));
      const before=JSON.stringify(previous||{}); const after=JSON.stringify(candidate); if(before!==after){changed++;statements.push(env.DB.prepare('INSERT INTO catalogue_changes(change_id,run_id,event_id,changed_at,changed_fields_json,before_json,after_json) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(),runId,candidate.eventId,timestamp,JSON.stringify(['event']),before,after));} published++;
    }
    statements.push(env.DB.prepare('UPDATE ingestion_candidates SET status=?,review_batch_id=?,updated_at=? WHERE candidate_id=?').bind(finalStatus,batchId,now(),review.candidateId));
  }
  statements.push(env.DB.prepare("UPDATE review_batches SET status='complete',completed_at=? WHERE batch_id=?").bind(now(),batchId));
  statements.push(env.DB.prepare("UPDATE ingestion_runs SET status='complete',finished_at=?,candidates_reviewed=?,events_published=?,changes_recorded=?,digest=? WHERE run_id=?").bind(now(),reviews.length,published,changed,`Published ${published} events; reviewed ${reviews.length} candidates.`,runId));
  statements.push(env.DB.prepare("INSERT INTO ingestion_config(key,value,updated_at) VALUES('latest_run_id',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(runId,now()));
  await env.DB.batch(statements); return json({ok:true,runId,published,changed,reviewed:reviews.length});
}

export default {
  async fetch(request:Request,env:IngestionEnv,_ctx:ExecutionContext) {
    const url=new URL(request.url);
    if(url.pathname==='/internal/run'&&request.method==='POST') { if(request.headers.get('Authorization')!==`Bearer ${env.INGESTION_SHARED_SECRET}`)return json({error:'Unauthorized'},401); if(!env.EVENT_INGESTION)return json({error:'Workflow binding unavailable'},503); const instance=await env.EVENT_INGESTION.create({id:`manual-${crypto.randomUUID()}`,params:{}}); return json({workflowId:instance.id},202); }
    if(url.pathname==='/internal/review/batch'&&request.method==='GET')return reviewBatch(env,request);
    if(url.pathname==='/internal/review/callback'&&request.method==='POST')return applyReview(env,request);
    return json({service:'bengaluru-live-ingestion',status:'ok'});
  },
  async queue(batch:MessageBatch<SourceMessage>,env:IngestionEnv,_ctx:ExecutionContext) { for(const message of batch.messages) { try { await fetchSource(env,message.body.runId,message.body.source); message.ack(); await maybeCreateReview(env,message.body.runId); } catch(error) { console.error('Source job failed',error); message.retry({delaySeconds:60}); } } },
};
