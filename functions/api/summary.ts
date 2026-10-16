import {configured,json,readRanges,readSession,type Context} from '../_lib/core';
import {preferenceCounts} from '../_lib/preferences';
export async function onRequestGet({request,env}:Context){
  if(!configured(env))return json({error:'Backend not configured'},503);
  const session=await readSession(request,env);if(!session)return json({error:'Unauthorized'},401);
  try{const [[master],counts]=await Promise.all([readRanges(env,['Events_Master!A1:A']),preferenceCounts(env.PREFERENCES_DB!,session.sub)]);const total=master.slice(1).map(x=>x[0]).filter(Boolean).length;return json({total,wishlist:counts.wishlisted,notInterested:counts.not_interested})}catch{return json({error:'Read failed'},502)}
}
