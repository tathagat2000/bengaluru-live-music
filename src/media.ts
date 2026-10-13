import type { EventImage } from './types';

/** Only display external images explicitly associated with a source event page. */
export function safeImageUrl(url: string): string {
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed.href : '';
  } catch { return ''; }
}

export function mediaFromRecords(records: Record<string,string>[]): Record<string, EventImage[]> {
  const result: Record<string,EventImage[]> = {};
  const seen = new Set<string>();
  for (const item of records) {
    const eventId = (item.Event_ID || '').trim();
    const url = safeImageUrl(item.Image_URL || '');
    const source = safeImageUrl(item.Source_Page_URL || '');
    if (!eventId || !url || !source || seen.has(eventId + '|' + url)) continue;
    // The two URLs need not be on the same host: official ticketing CDNs often use a separate domain.
    seen.add(eventId + '|' + url);
    const image:EventImage={
      url, sourceUrl:source, alt:(item.Alt_Text||'Event image').trim(),
      type:(item.Image_Type||'poster').trim(),
      order:Number(item.Image_Order)||1,
    };
    (result[eventId] ||= []).push(image);
  }
  for (const entries of Object.values(result)) entries.sort((a,b)=>a.order-b.order);
  return result;
}
