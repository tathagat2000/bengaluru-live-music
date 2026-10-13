import {configured,eventFromRecord,json,latestStates,parseRecords,readRanges,readSession,type Context} from '../../_lib/core';
export async function onRequestGet({request,env}:Context){
  if(!configured(env))return json({error:'Backend not configured'},503);
  const session=await readSession(request,env);if(!session)return json({error:'Unauthorized'},401);
  try{
    const [events,prefs]=await readRanges(env,['Events_Master!A1:AB','User_Preferences!A1:F']);
    const states=latestStates(parseRecords(prefs),session.sub);
    const result=parseRecords(events).map(r=>eventFromRecord(r,states[r.Event_ID]||'neutral'));
    return json({events:result,lastSynced:new Date().toISOString(),mode:'live'});
  }catch(e){return json({error:e instanceof Error?e.message:'Read failed'},502)}
}
