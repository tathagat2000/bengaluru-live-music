import {configured,json,latestStates,parseRecords,readRanges,readSession,type Context} from '../_lib/core';
export async function onRequestGet({request,env}:Context){
  if(!configured(env))return json({error:'Backend not configured'},503);
  const session=await readSession(request,env);if(!session)return json({error:'Unauthorized'},401);
  try{const [master,prefs]=await readRanges(env,['Events_Master!A1:A','User_Preferences!A1:F']);const s=latestStates(parseRecords(prefs),session.sub);const ids=master.slice(1).map(x=>x[0]).filter(Boolean);return json({total:ids.length,wishlist:ids.filter(id=>s[id]==='wishlisted').length,notInterested:ids.filter(id=>s[id]==='not_interested').length})}catch{return json({error:'Read failed'},502)}
}
