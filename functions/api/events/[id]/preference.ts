import {configured,json,readRanges,readSession,safeOrigin,type Context} from '../../../_lib/core';
import {savePreference,type InterestState} from '../../../_lib/preferences';
const states=new Set(['neutral','wishlisted','not_interested']);
export async function onRequestPost({request,env,params}:Context){
  if(!configured(env))return json({error:'Backend not configured'},503);
  if(!safeOrigin(request)||!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'Invalid origin or content type'},403);
  const session=await readSession(request,env);if(!session)return json({error:'Unauthorized'},401);
  let data:Record<string,unknown>;try{data=await request.json() as Record<string,unknown>}catch{return json({error:'Invalid JSON'},400)}
  const id=params.id,state=data.state;
  if(typeof id!=='string'||!id||id.length>250||typeof state!=='string'||!states.has(state))return json({error:'Invalid event or preference'},400);
  try{
    const [master]=await readRanges(env,['Events_Master!A1:A']);
    if(!master.slice(1).some(x=>x[0]===id))return json({error:'Event not found'},404);
    const savedAt=await savePreference(env.PREFERENCES_DB!,session.sub,id,state as InterestState);
    return json({state,savedAt});
  }catch(e){return json({error:e instanceof Error?e.message:'Write failed'},502)}
}
