import {configured,json,readRanges,readSession,safeOrigin,type Context} from '../../../_lib/core';
const states=new Set(['neutral','wishlisted','not_interested']);
export async function onRequestPost({request,env,params}:Context){
  if(!configured(env))return json({error:'Backend not configured'},503);
  if(!safeOrigin(request)||!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'Invalid origin or content type'},403);
  const session=await readSession(request,env);if(!session)return json({error:'Unauthorized'},401);
  let data:Record<string,unknown>;try{data=await request.json() as Record<string,unknown>}catch{return json({error:'Invalid JSON'},400)}
  const id=params.id,state=data.state,requestId=data.requestId;
  if(typeof id!=='string'||!id||id.length>250||typeof state!=='string'||!states.has(state)||typeof requestId!=='string'||!/^[0-9a-f-]{36}$/i.test(requestId))return json({error:'Invalid event, preference or request ID'},400);
  try{
    const [master]=await readRanges(env,['Events_Master!A1:A']);
    if(!master.slice(1).some(x=>x[0]===id))return json({error:'Event not found'},404);
    const prior=await env.DB!.prepare('SELECT event_id,state FROM preference_requests WHERE user_id=? AND request_id=?').bind(session.sub,requestId).first<{event_id:string;state:string}>();
    if(prior){if(prior.event_id!==id||prior.state!==state)return json({error:'Duplicate request ID with different parameters'},409);return json({state,duplicate:true});}
    const savedAt=new Date().toISOString();
    const mutation=state==='neutral'
      ?env.DB!.prepare('DELETE FROM user_preferences WHERE user_id=? AND event_id=?').bind(session.sub,id)
      :env.DB!.prepare('INSERT INTO user_preferences(user_id,event_id,state,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id,event_id) DO UPDATE SET state=excluded.state,updated_at=excluded.updated_at').bind(session.sub,id,state,savedAt);
    await env.DB!.batch([
      env.DB!.prepare('INSERT OR IGNORE INTO preference_requests(user_id,request_id,event_id,state,created_at) VALUES(?,?,?,?,?)').bind(session.sub,requestId,id,state,savedAt),
      mutation,
    ]);
    return json({state,savedAt});
  }catch(e){return json({error:e instanceof Error?e.message:'Write failed'},502)}
}
