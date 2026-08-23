import { voiceDb } from '../voice/tenant-scope.js';

export type CalendarEventRow = {
  externalEventId: string;
  title: string;
  startTime: Date;
  endTime: Date;
};

/** Batch upsert calendar_events — one query per chunk instead of per event. */
export async function batchUpsertCalendarEvents(
  connectionId: string,
  events: CalendarEventRow[]
): Promise<number> {
  if (!events.length) return 0;

  const CHUNK = 100;
  let total = 0;

  for (let i = 0; i < events.length; i += CHUNK) {
    const chunk = events.slice(i, i + CHUNK);
    await voiceDb.query(
      `INSERT INTO public.calendar_events
         (calendar_connection_id, external_event_id, title, start_time, end_time, is_busy)
       SELECT $1, e.id, e.title, e.start_time, e.end_time, true
       FROM unnest($2::text[], $3::text[], $4::timestamptz[], $5::timestamptz[])
         AS e(id, title, start_time, end_time)
       ON CONFLICT (calendar_connection_id, external_event_id) DO UPDATE SET
         title = EXCLUDED.title,
         start_time = EXCLUDED.start_time,
         end_time = EXCLUDED.end_time,
         is_busy = EXCLUDED.is_busy`,
      [
        connectionId,
        chunk.map((e) => e.externalEventId),
        chunk.map((e) => e.title),
        chunk.map((e) => e.startTime),
        chunk.map((e) => e.endTime),
      ]
    );
    total += chunk.length;
  }

  return total;
}
