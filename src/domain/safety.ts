/**
 * Reporting and blocking rules (ARCHITECTURE.md section 5). The SQL in
 * supabase/migrations/20261117000002_safety.sql enforces the same ones; change both together.
 */
import type { ReportReason } from './types';

export const REPORT_REASONS: { id: ReportReason; label: string; hint: string }[] = [
  { id: 'harassment', label: 'Harassment', hint: 'Pushy, rude, threatening, would not take no.' },
  { id: 'unsafe', label: 'I felt unsafe', hint: 'Something at or around the micro-date.' },
  { id: 'inappropriate', label: 'Inappropriate', hint: 'Sexual, hateful or violent content.' },
  { id: 'fake', label: 'Fake profile', hint: 'Not who they say they are, or a bot.' },
  { id: 'underage', label: 'Under 18', hint: 'They look or say they are under 18.' },
  { id: 'shared_contact', label: 'Shared a contact early', hint: 'A handle, a number or a code for one, before a kept promise.' },
  { id: 'other', label: 'Something else', hint: 'Tell us below.' },
];

export const REPORT_DETAIL_MAX = 500;
export const REPORTS_PER_DAY = 10;
