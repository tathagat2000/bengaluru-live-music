import { eventFromRecord, type D1Database } from './core';
import type { EventImage } from '../../src/types';

type CatalogueRow = Record<string, unknown>;
const text = (value: unknown) => value == null ? '' : String(value);

export function catalogueRecord(row: CatalogueRow): Record<string, string> {
  return {
    Event_ID: text(row.event_id), Event_Name: text(row.event_name), Artists: text(row.artists),
    Primary_Genre: text(row.primary_genre), Subgenres: text(row.subgenres), Event_Format: text(row.event_format),
    Tribute_To: text(row.tribute_to), Start_Date: text(row.start_date), Start_Time: text(row.start_time),
    End_DateTime: text(row.end_datetime), Venue: text(row.venue), Area: text(row.area), Organizer: text(row.organizer),
    Price_Min_INR: text(row.price_min_inr), Price_Max_INR: text(row.price_max_inr), Admission_Type: text(row.admission_type),
    Ticket_Status: text(row.ticket_status), Event_Status: text(row.event_status), Booking_URL: text(row.booking_url),
    Source_URLs: text(row.source_urls), Source_Event_IDs: text(row.source_event_ids), Relevance_Tier: text(row.relevance_tier),
    Verification: text(row.verification), First_Seen_At: text(row.first_seen_at), First_Seen_Run_ID: text(row.first_seen_run_id),
    Last_Verified_At: text(row.last_verified_at), Last_Changed_At: text(row.last_changed_at), Notes: text(row.notes),
    Event_Category: text(row.event_category),
  };
}

export async function readCatalogue(db: D1Database, userId: string) {
  const [events, images, preferences] = await Promise.all([
    db.prepare("SELECT * FROM catalogue_events WHERE LOWER(event_status) NOT IN ('cancelled','past') ORDER BY start_date,start_time,event_name").all<CatalogueRow>(),
    db.prepare('SELECT * FROM catalogue_images ORDER BY event_id,image_order').all<CatalogueRow>(),
    db.prepare('SELECT event_id,state FROM user_preferences WHERE user_id=?').bind(userId).all<{event_id:string;state:string}>(),
  ]);
  const media: Record<string, EventImage[]> = {};
  for (const row of images.results) {
    const eventId = text(row.event_id); const url = text(row.image_url); const sourceUrl = text(row.source_page_url);
    if (!eventId || !url || !sourceUrl) continue;
    (media[eventId] ||= []).push({url, sourceUrl, alt:text(row.alt_text) || 'Event image', type:text(row.image_type) || 'poster', order:Number(row.image_order) || 1});
  }
  const states = Object.fromEntries(preferences.results.map(row => [row.event_id, row.state]));
  return events.results.map(row => eventFromRecord(catalogueRecord(row), states[text(row.event_id)] || 'neutral', media[text(row.event_id)] || []));
}

export async function readCatalogueEvent(db: D1Database, id: string, userId: string) {
  const row = await db.prepare('SELECT * FROM catalogue_events WHERE event_id=?').bind(id).first<CatalogueRow>();
  if (!row) return null;
  const [images, preference] = await Promise.all([
    db.prepare('SELECT * FROM catalogue_images WHERE event_id=? ORDER BY image_order').bind(id).all<CatalogueRow>(),
    db.prepare('SELECT state FROM user_preferences WHERE user_id=? AND event_id=?').bind(userId,id).first<{state:string}>(),
  ]);
  const media: EventImage[] = images.results.map(image => ({url:text(image.image_url),sourceUrl:text(image.source_page_url),alt:text(image.alt_text)||'Event image',type:text(image.image_type)||'poster',order:Number(image.image_order)||1}));
  return eventFromRecord(catalogueRecord(row), preference?.state || 'neutral', media);
}

export async function catalogueSummary(db: D1Database, userId: string) {
  const total = await db.prepare("SELECT COUNT(*) AS count FROM catalogue_events WHERE LOWER(event_status) NOT IN ('cancelled','past')").first<{count:number}>();
  const counts = await db.prepare('SELECT state,COUNT(*) AS count FROM user_preferences WHERE user_id=? GROUP BY state').bind(userId).all<{state:string;count:number}>();
  const run = await db.prepare('SELECT run_id,status,finished_at,events_published,source_failures FROM ingestion_runs ORDER BY started_at DESC LIMIT 1').first<Record<string,unknown>>();
  return {total:Number(total?.count || 0),wishlist:Number(counts.results.find(row => row.state==='wishlisted')?.count || 0),notInterested:Number(counts.results.find(row => row.state==='not_interested')?.count || 0),latestRun:run || null};
}

export function validReviewSecret(request: Request, secret?: string) {
  return Boolean(secret && request.headers.get('Authorization') === `Bearer ${secret}`);
}

export function safeJson(value: unknown, fallback: unknown) {
  try { return JSON.parse(String(value || '')); } catch { return fallback; }
}

export function numeric(value: unknown) { const n = Number(value); return Number.isFinite(n) ? n : null; }
