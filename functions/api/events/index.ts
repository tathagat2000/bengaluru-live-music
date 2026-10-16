import {configured,json,readSession,type Context} from '../../_lib/core';
import {readCatalogue} from '../../_lib/catalogue';
export async function onRequestGet({request,env}:Context){
  if(!configured(env))return json({error:'Backend not configured'},503);
  const session=await readSession(request,env);if(!session)return json({error:'Unauthorized'},401);
  try{return json({events:await readCatalogue(env.DB!,session.sub),lastSynced:new Date().toISOString(),mode:'live'});}
  catch(e){return json({error:e instanceof Error?e.message:'Read failed'},502)}
}
