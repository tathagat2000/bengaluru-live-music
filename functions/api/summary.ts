import {configured,json,readSession,type Context} from '../_lib/core';
import {catalogueSummary} from '../_lib/catalogue';
export async function onRequestGet({request,env}:Context){
  if(!configured(env))return json({error:'Backend not configured'},503);
  const session=await readSession(request,env);if(!session)return json({error:'Unauthorized'},401);
  try{return json(await catalogueSummary(env.DB!,session.sub));}catch{return json({error:'Read failed'},502)}
}
