export const isBengaluru = (value:string) => /bengaluru|bangalore|whitefield|electronic city|indiranagar|koramangala|jayanagar|malleshwaram|hebbal|yelahanka|mg road|hennur|sarjapur|marathahalli|jp nagar|banashankari|rajajinagar/i.test(value);
export const categoryFor = (type:string,name:string) => { const value=`${type} ${name}`.toLowerCase(); if(/comedy|stand.?up/.test(value))return 'comedy'; if(/theatre|theater|play|drama/.test(value))return 'theatre'; if(/dance|ballet/.test(value))return 'dance'; if(/workshop|masterclass|class/.test(value))return 'workshop'; if(/talk|lecture|discussion|panel/.test(value))return 'talk'; if(/exhibition|gallery/.test(value))return 'exhibition'; if(/sport|match|run|marathon/.test(value))return 'sport'; if(/festival/.test(value))return 'festival'; return 'music'; };
const eventTypes = new Set(['Event','MusicEvent','TheaterEvent','ComedyEvent','DanceEvent','SportsEvent','Festival']);

export function parseJsonLd(html:string): Record<string,unknown>[] {
  const entries:Record<string,unknown>[]=[];
  const expression=/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for(const match of html.matchAll(expression)) { try { const parsed=JSON.parse(match[1]); const values=Array.isArray(parsed)?parsed:[parsed]; for(const item of values) { if(item&&typeof item==='object'&&Array.isArray((item as Record<string,unknown>)['@graph'])) values.push(...(item as Record<string,unknown>)['@graph'] as Record<string,unknown>[]); else if(item&&typeof item==='object') entries.push(item as Record<string,unknown>); } } catch { /* invalid JSON-LD is not evidence */ } }
  return entries.filter(item=>{const type=item['@type'];return typeof type==='string'?eventTypes.has(type):Array.isArray(type)&&type.some(x=>eventTypes.has(String(x)));});
}
