import { configured,eventFromRecord,json,latestStates,parseRecords,readRanges,readSession,type Context } from '../../_lib/core';
export async function onRequestGet({request,env,params}:Context){
  if(!configured(env))return json({error:'Backend not configured'},503);
  const session=await readSession(request,env);if(!session)return json({error:'Unauthorized'},401);
  const id=params.id;if(typeof id!=='string')return json({error:'Invalid event'},400);
  try{const [rows,prefs]=await readRanges(env,['Events_Master!A1:AB','User_Preferences!A1:F']);const event=parseRecords(rows).find(x=>x.Event_ID===id);if(!event)return json({error:'Event not found'},404);const states=latestStates(parseRecords(prefs),session.sub);return json({event:eventFromRecord(event,states[id]||'neutral')})}catch(e){return json({error:e instanceof Error?e.message:'Read failed'},502)}
}
