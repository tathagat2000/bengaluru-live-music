import { configured,json,readSession,type Context } from '../../_lib/core';
import {readCatalogueEvent} from '../../_lib/catalogue';
export async function onRequestGet({request,env,params}:Context){
  if(!configured(env))return json({error:'Backend not configured'},503);
  const session=await readSession(request,env);if(!session)return json({error:'Unauthorized'},401);
  const id=params.id;if(typeof id!=='string')return json({error:'Invalid event'},400);
  try{const event=await readCatalogueEvent(env.DB!,id,session.sub);if(!event)return json({error:'Event not found'},404);return json({event})}catch(e){return json({error:e instanceof Error?e.message:'Read failed'},502)}
}
