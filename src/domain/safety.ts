/**
 * Reporting and blocking rules (ARCHITECTURE.md section 5). The SQL in
 * supabase/migrations/20261117000002_safety.sql enforces the same ones; change both together.
 */
import type { ReportReason } from './types';
import { t } from '../i18n';

/** The words come from src/i18n (`reportReasons`); the ids are the SQL's. */
export const REPORT_REASONS: { id: ReportReason; readonly label: string; readonly hint: string }[] = ([
  'harassment',
  'unsafe',
  'inappropriate',
  'fake',
  'underage',
  'shared_contact',
  'other',
] as const).map((id) => ({
  id,
  get label() {
    return t(`reportReasons.${id}.label`);
  },
  get hint() {
    return t(`reportReasons.${id}.hint`);
  },
}));

export const REPORT_DETAIL_MAX = 500;
export const REPORTS_PER_DAY = 10;
