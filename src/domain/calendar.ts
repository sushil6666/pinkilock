/**
 * A plan as a calendar file (RFC 5545), for "Add to calendar" (ROADMAP Phase 4). The file is made
 * on the phone and goes only where the person sends it: Pinkilock shares it with no calendar
 * service. It carries what the plan screen shows (the idea, a first name, the place, the time) and
 * never a contact handle. Times are written in UTC, so every calendar shows them on its own clock.
 * Pure, so tests/unit/calendar.test.ts runs it in Node.
 */
export interface CalendarPlan {
  id: string;
  title: string;
  startsAt: number;
  minutes: number;
  place: string;
  note: string;
}

const utc = (t: number) => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Text in a property value: backslash, semicolon, comma and line breaks escaped. */
const text = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Lines over 75 octets fold onto the next line, which starts with a space. */
function fold(line: string): string {
  const out: string[] = [];
  let cur = '';
  let size = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (size + n > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = '';
      size = 0;
    }
    cur += ch;
    size += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

export function icsFor(plan: CalendarPlan, now = Date.now()): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Pinkilock//Plan//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${plan.id}@pinkilock`,
    `DTSTAMP:${utc(now)}`,
    `DTSTART:${utc(plan.startsAt)}`,
    `DTEND:${utc(plan.startsAt + plan.minutes * 60_000)}`,
    `SUMMARY:${text(plan.title)}`,
    `LOCATION:${text(plan.place)}`,
    `DESCRIPTION:${text(plan.note)}`,
    // A nudge half an hour before: the plan is a promise.
    'BEGIN:VALARM',
    'TRIGGER:-PT30M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${text(plan.title)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].map(fold).join('\r\n') + '\r\n';
}
