import { configured,eventFromRecord,json,parseRecords,readRanges,readSession,type Context } from '../../_lib/core';
import {mediaFromRecords} from '../../../src/media';
export async function onRequestGet({request,env,params}:Context){
  if(!configured(env))return json({error:'Backend not configured'},503);
  const session=await readSession(request,env);if(!session)return json({error:'Unauthorized'},401);
  const id=params.id;if(typeof id!=='string')return json({error:'Invalid event'},400);
  try{const [rows,images]=await readRanges(env,['Events_Master!A1:AB','Event_Images!A1:H']);const event=parseRecords(rows).find(x=>x.Event_ID===id);if(!event)return json({error:'Event not found'},404);const preference=await env.DB!.prepare('SELECT state FROM user_preferences WHERE user_id=? AND event_id=?').bind(session.sub,id).first<{state:string}>();return json({event:eventFromRecord(event,preference?.state||'neutral',mediaFromRecords(parseRecords(images))[id]||[])})}catch(e){return json({error:e instanceof Error?e.message:'Read failed'},502)}
}
