import seed from './seed-events.json';
import imageSeed from './seed-images.json';
import { mediaFromRecords } from './media';
const imagesByEvent=mediaFromRecords(imageSeed);
import type { Concert, InterestState } from './types';
function num(s:string|undefined){return s!==undefined&&s!==''&&!Number.isNaN(Number(s))?Number(s):null}
export function seedConcerts(prefs:Record<string,InterestState>={}):Concert[]{
  return seed.map(x=>({
    id:x.Event_ID,name:x.Event_Name,artists:x.Artists,genre:x.Primary_Genre,images:imagesByEvent[x.Event_ID]||[],
    subgenres:(x.Subgenres||'').split(';').map(y=>y.trim()).filter(Boolean),
    format:x.Event_Format,eventCategory:'music',tributeTo:x.Tribute_To||'',date:x.Start_Date,time:x.Start_Time||'',
    venue:x.Venue,area:x.Area,organizer:'',priceMin:num(x.Price_Min_INR),priceMax:null,
    admissionType:x.Admission_Type,ticketStatus:x.Ticket_Status,eventStatus:x.Event_Status,
    bookingUrl:x.Booking_URL||'',sourceUrl:x.Source_URLs||'',relevance:x.Relevance_Tier,
    verification:x.Verification,firstSeen:'2026-10-13',lastVerified:'',notes:x.Notes||'',
    preference:prefs[x.Event_ID]||'neutral'
  }));
}
