import {configured,eventFromRecord,json,parseRecords,readRanges,readSession,type Context} from '../../_lib/core';
import {mediaFromRecords} from '../../../src/media';
import {readPreferences} from '../../_lib/preferences';
export async function onRequestGet({request,env}:Context){
  if(!configured(env))return json({error:'Backend not configured'},503);
  const session=await readSession(request,env);if(!session)return json({error:'Unauthorized'},401);
  try{
    const [[events,images],states]=await Promise.all([
      readRanges(env,['Events_Master!A1:AB','Event_Images!A1:H']),
      readPreferences(env.PREFERENCES_DB!,session.sub),
    ]);
    const media=mediaFromRecords(parseRecords(images));
    const result=parseRecords(events).map(r=>eventFromRecord(r,states[r.Event_ID]||'neutral',media[r.Event_ID]||[]));
    return json({events:result,lastSynced:new Date().toISOString(),mode:'live'});
  }catch(e){return json({error:e instanceof Error?e.message:'Read failed'},502)}
}
