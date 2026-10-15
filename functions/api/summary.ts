import {configured,json,readRanges,readSession,type Context} from '../_lib/core';
export async function onRequestGet({request,env}:Context){
  if(!configured(env))return json({error:'Backend not configured'},503);
  const session=await readSession(request,env);if(!session)return json({error:'Unauthorized'},401);
  try{const [master]=await readRanges(env,['Events_Master!A1:A']);const counts=await env.DB!.prepare('SELECT state,COUNT(*) AS count FROM user_preferences WHERE user_id=? GROUP BY state').bind(session.sub).all<{state:string;count:number}>();const summary=Object.fromEntries(counts.results.map(row=>[row.state,Number(row.count)]));return json({total:master.slice(1).filter(x=>x[0]).length,wishlist:summary.wishlisted||0,notInterested:summary.not_interested||0})}catch{return json({error:'Read failed'},502)}
}
