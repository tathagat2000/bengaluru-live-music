import {configured,json,readRanges,readSession,safeOrigin,type Context} from '../../_lib/core';
import {savePreferences,type InterestState} from '../../_lib/preferences';

const states=new Set(['neutral','wishlisted','not_interested']);
const maxEventsPerRequest=250;

export async function onRequestPost({request,env}:Context){
  if(!configured(env))return json({error:'Backend not configured'},503);
  if(!safeOrigin(request)||!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'Invalid origin or content type'},403);
  const session=await readSession(request,env);if(!session)return json({error:'Unauthorized'},401);
  let data:Record<string,unknown>;try{data=await request.json() as Record<string,unknown>}catch{return json({error:'Invalid JSON'},400)}
  const ids=data.ids;
  const state=data.state;
  if(!Array.isArray(ids)||ids.length===0||ids.length>maxEventsPerRequest||ids.some(id=>typeof id!=='string'||!id||id.length>250)||typeof state!=='string'||!states.has(state))return json({error:'Invalid events or preference'},400);
  const eventIds=[...new Set(ids as string[])];
  try{
    const [master]=await readRanges(env,['Events_Master!A1:A']);
    const available=new Set(master.slice(1).map(row=>row[0]).filter(Boolean));
    if(eventIds.some(id=>!available.has(id)))return json({error:'One or more events were not found'},404);
    const savedAt=await savePreferences(env.PREFERENCES_DB!,session.sub,eventIds,state as InterestState);
    return json({state,savedAt,updated:eventIds.length});
  }catch(e){return json({error:e instanceof Error?e.message:'Write failed'},502)}
}
