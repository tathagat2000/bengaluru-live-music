import {appendPreference,configured,json,parseRecords,readRanges,readSession,safeOrigin,type Context} from '../../../_lib/core';
const states=new Set(['neutral','wishlisted','not_interested']);
export async function onRequestPost({request,env,params}:Context){
  if(!configured(env))return json({error:'Backend not configured'},503);
  if(!safeOrigin(request)||!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'Invalid origin or content type'},403);
  const session=await readSession(request,env);if(!session)return json({error:'Unauthorized'},401);
  let data:Record<string,unknown>;try{data=await request.json() as Record<string,unknown>}catch{return json({error:'Invalid JSON'},400)}
  const id=params.id,state=data.state,requestId=data.requestId;
  if(typeof id!=='string'||!id||id.length>250||typeof state!=='string'||!states.has(state)||typeof requestId!=='string'||!/^[0-9a-f-]{36}$/i.test(requestId))return json({error:'Invalid event, preference or request ID'},400);
  try{
    const [master,log]=await readRanges(env,['Events_Master!A1:A','User_Preferences!A1:F']);
    if(!master.slice(1).some(x=>x[0]===id))return json({error:'Event not found'},404);
    const rows=parseRecords(log),prior=rows.find(x=>x.Client_Request_ID===requestId&&x.User_ID===session.sub);
    if(prior){if(prior.Event_ID!==id||prior.New_State!==state)return json({error:'Duplicate request ID with different parameters'},409);return json({state,duplicate:true})}
    const now=new Date().toISOString();
    await appendPreference(env,[crypto.randomUUID(),id,session.sub,state,now,requestId]);
    return json({state,savedAt:now});
  }catch(e){return json({error:e instanceof Error?e.message:'Write failed'},502)}
}
