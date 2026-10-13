import { configured,json,safeOrigin,sessionCookie,verifyGoogleToken,type Context } from '../../_lib/core';
export async function onRequestPost({request,env}:Context){
  if(!configured(env))return json({error:'Backend not configured'},503);
  if(!safeOrigin(request)||!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'Invalid request origin or content type'},403);
  let credential:string;try{const data=await request.json() as {credential?:unknown};credential=typeof data.credential==='string'?data.credential:''}catch{return json({error:'Bad JSON'},400)}
  try{const user=await verifyGoogleToken(credential,env);const cookie=await sessionCookie({...user,exp:Math.floor(Date.now()/1000)+604800},env.SESSION_SECRET!);return json({authenticated:true,email:user.email},200,{'Set-Cookie':cookie})}
  catch(e){return json({error:e instanceof Error?e.message:'Unauthorized'},401)}
}
