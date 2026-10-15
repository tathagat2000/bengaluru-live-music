import {configured,eventFromRecord,json,parseRecords,readRanges,readSession,type Context} from '../../_lib/core';
import {mediaFromRecords} from '../../../src/media';
export async function onRequestGet({request,env}:Context){
  if(!configured(env))return json({error:'Backend not configured'},503);
  const session=await readSession(request,env);if(!session)return json({error:'Unauthorized'},401);
  try{
    const [events,images]=await readRanges(env,['Events_Master!A1:AB','Event_Images!A1:H']);
    const media=mediaFromRecords(parseRecords(images));
    const preferences=await env.DB!.prepare('SELECT event_id,state FROM user_preferences WHERE user_id=?').bind(session.sub).all();
    const states=Object.fromEntries((preferences.results as {event_id:string;state:string}[]).map(x=>[x.event_id,x.state]));
    const result=parseRecords(events).map(r=>eventFromRecord(r,states[r.Event_ID]||'neutral',media[r.Event_ID]||[]));
    return json({events:result,lastSynced:new Date().toISOString(),mode:'live'});
  }catch(e){return json({error:e instanceof Error?e.message:'Read failed'},502)}
}
