import type { D1Database } from './d1';

export type InterestState='neutral'|'wishlisted'|'not_interested';
type PreferenceRow={event_id:string;state:InterestState};

export async function readPreferences(db:D1Database,userId:string):Promise<Record<string,InterestState>>{
  const result=await db.prepare('SELECT event_id,state FROM user_preferences WHERE user_id=?').bind(userId).all<PreferenceRow>();
  const states:Record<string,InterestState>={};
  for(const row of result.results||[])states[row.event_id]=row.state;
  return states;
}

export async function preferenceCounts(db:D1Database,userId:string){
  const result=await db.prepare('SELECT state,COUNT(*) AS count FROM user_preferences WHERE user_id=? GROUP BY state').bind(userId).all<{state:InterestState;count:number}>();
  const counts:Record<InterestState,number>={neutral:0,wishlisted:0,not_interested:0};
  for(const row of result.results||[])counts[row.state]=row.count;
  return counts;
}

export async function savePreference(db:D1Database,userId:string,eventId:string,state:InterestState){
  const savedAt=new Date().toISOString();
  const result=await db.prepare(`INSERT INTO user_preferences (user_id,event_id,state,updated_at) VALUES (?,?,?,?)
    ON CONFLICT(user_id,event_id) DO UPDATE SET state=excluded.state,updated_at=excluded.updated_at`).bind(userId,eventId,state,savedAt).run();
  if(!result.success)throw Error('Cloudflare D1 preference write failed');
  return savedAt;
}
