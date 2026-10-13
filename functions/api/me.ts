import { configured,json,readSession,type Context } from '../_lib/core';
export async function onRequestGet({request,env}:Context){
  const active=configured(env);const ses=active?await readSession(request,env):null;
  return json({authenticated:!!ses,email:ses?.email,configured:active});
}
