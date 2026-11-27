/**
 * Expert tips (D127). Topics, kinds of expert, the team's general tips, and the rules for experts.
 * Pure TypeScript: no React Native, so unit tests load it in plain Node. The server side is in
 * supabase/migrations/20261127000026_experts.sql; experts and their tips are written by the team only.
 */

export const EXPERT_TOPICS = ['dating', 'premarital', 'conflict', 'breakup'] as const;
export type ExpertTopic = (typeof EXPERT_TOPICS)[number];
export const TOPIC_EMOJI: Record<ExpertTopic, string> = { dating: '💬', premarital: '💍', conflict: '🤝', breakup: '🌱' };

export const EXPERT_KINDS = ['therapist', 'coach', 'intimacy', 'spiritual'] as const;
export type ExpertKind = (typeof EXPERT_KINDS)[number];

export const REPORT_REASONS = ['guaranteed', 'manipulation', 'money_cures', 'sexual', 'other'] as const;
export type ExpertReportReason = (typeof REPORT_REASONS)[number];

/** The team's general tips until vetted experts add their own; words in src/i18n (`experts.tipTitles`, `experts.tips`). */
export const GENERAL_TIPS = {
  dating: ['slow_start', 'be_curious', 'red_flags', 'public_first', 'be_yourself'],
  premarital: ['money_values', 'families', 'roles', 'future_plans', 'fight_style'],
  conflict: ['cool_down', 'i_statements', 'one_issue', 'repair_try', 'when_help'],
  breakup: ['let_feel', 'no_contact', 'routine', 'people', 'lessons'],
} as const satisfies Record<ExpertTopic, readonly string[]>;

/** The rules every expert agrees to, and the warning signs shown to everyone; words in `experts.rules` and `experts.watch`. */
export const EXPERT_RULES = ['licensed', 'no_guarantees', 'no_manipulation', 'no_paid_cures', 'not_sexual', 'all_faiths', 'stay_in_scope'] as const;
export const WATCH_OUT = ['guaranteed', 'manipulation', 'money_cures', 'pressure'] as const;

export interface Expert {
  id: string;
  name: string;
  kind: ExpertKind;
  credential: string;
  city: string | null;
  languages: string[];
  bio: string;
}
export interface ExpertTip {
  id: string;
  topic: ExpertTopic;
  title: string;
  body: string;
  expert: Expert;
}
export interface ExpertApplication {
  kind: ExpertKind;
  status: 'new' | 'talking' | 'listed' | 'declined';
}
export interface ExpertApply {
  name: string;
  kind: ExpertKind | null;
  credential: string;
  city: string;
  contact: string;
  note: string;
  agree: boolean;
}

export const isTopic = (x: unknown): x is ExpertTopic => (EXPERT_TOPICS as readonly unknown[]).includes(x);
export const isKind = (x: unknown): x is ExpertKind => (EXPERT_KINDS as readonly unknown[]).includes(x);
const str = (x: unknown) => (typeof x === 'string' ? x : '');

/** '' when the form can be sent; else the error code. As public.expert_apply. */
export function checkApply(a: ExpertApply): '' | 'PL244' | 'PL245' {
  if (!a.agree) return 'PL244';
  const len = (s: string) => s.trim().length;
  if (!isKind(a.kind) || len(a.name) < 2 || len(a.name) > 80 || len(a.credential) < 2 || len(a.credential) > 160
    || len(a.city) < 2 || len(a.city) > 60 || len(a.contact) < 5 || len(a.contact) > 120 || a.note.length > 600) return 'PL245';
  return '';
}

export function expertTipsFrom(raw: unknown): ExpertTip[] {
  return (Array.isArray(raw) ? raw : []).flatMap((x): ExpertTip[] => {
    const r = (x ?? {}) as Record<string, unknown>;
    const e = (r.expert ?? {}) as Record<string, unknown>;
    if (!isTopic(r.topic) || !isKind(e.kind) || !str(e.name) || !str(e.credential)) return [];
    return [{ id: String(r.id), topic: r.topic, title: str(r.title), body: str(r.body),
      expert: { id: str(e.id), name: str(e.name), kind: e.kind, credential: str(e.credential), city: str(e.city) || null,
        languages: Array.isArray(e.languages) ? e.languages.filter((l): l is string => typeof l === 'string') : [], bio: str(e.bio) } }];
  });
}

export function applicationFrom(raw: unknown): ExpertApplication | null {
  const r = (raw ?? null) as Record<string, unknown> | null;
  if (!r || !isKind(r.kind)) return null;
  const s = r.status;
  return { kind: r.kind, status: s === 'talking' || s === 'listed' || s === 'declined' ? s : 'new' };
}
