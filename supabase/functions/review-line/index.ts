/**
 * review-line: the AI step of profile line review (docs/build-plan.md, WP1; gap G18).
 *
 * Called by Postgres (pg_net, every minute while lines wait and private.config line_review is
 * 'ai'), with the same shared secret as `push`. It claims waiting lines, asks Claude whether each
 * one is an attempt to pass contact details, and records the decision: approved lines go on the
 * card, a contact is rejected, and anything unsure (or a model that declined) is held for a person.
 *
 * Only the line itself is sent to Claude: no name, no id, nothing else.
 *
 * Secrets (supabase secrets set ...):
 *   PUSH_HOOK_SECRET    shared with Postgres, as for push. Required.
 *   ANTHROPIC_API_KEY   the Claude API key. Without it nothing is claimed and lines keep waiting.
 *   REVIEW_MODEL        optional; defaults to claude-opus-5-5.
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
 */
import Anthropic from 'npm:@anthropic-ai/sdk@1.9.0';
import { SYSTEM, VERDICT_SCHEMA, decisionFor, parseVerdict, userMessage } from './decide.ts';

const HOOK_SECRET = Deno.env.get('PUSH_HOOK_SECRET') ?? '';
const API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const MODEL = Deno.env.get('REVIEW_MODEL') ?? 'claude-opus-5-5';
const REST = `${Deno.env.get('SUPABASE_URL')}/rest/v1`;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const BATCH = 20;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function rpc<T>(fn: string, body: unknown): Promise<T> {
  const res = await fetch(`${REST}/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${fn}: ${res.status} ${text}`);
  return (text ? JSON.parse(text) : null) as T;
}

/** Constant-time, so the secret cannot be guessed a character at a time. */
function sameSecret(given: string, want: string): boolean {
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(want);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

const client = new Anthropic({ apiKey: API_KEY, timeout: 60_000, maxRetries: 2 });

async function judge(line: string) {
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 4096,
    // A simple classification: low effort is enough, and keeps each review cheap and quick.
    output_config: { effort: 'low', format: { type: 'json_schema', schema: VERDICT_SCHEMA } },
    // If the model declines, the API retries on a fallback model inside the same call.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM,
    messages: [{ role: 'user', content: userMessage(line) }],
  });
  // The whole fallback chain declined: a person decides.
  if (response.stop_reason === 'refusal') return { decision: 'held' as const, reason: 'the reviewer declined this line' };
  const block = response.content.find((b) => b.type === 'text');
  const text = block?.type === 'text' ? block.text : undefined;
  return decisionFor(parseVerdict(text));
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const given = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
  if (!HOOK_SECRET || !sameSecret(given, HOOK_SECRET)) return json({ error: 'Not allowed' }, 401);
  if (!API_KEY) return json({ reviewed: 0, note: 'ANTHROPIC_API_KEY is not set; lines keep waiting' });

  const rows = await rpc<{ profile_id: string; text: string }[]>('claim_line_reviews', { p_limit: BATCH });
  const totals = { reviewed: 0, approved: 0, rejected: 0, held: 0, failed: 0 };
  for (const row of rows ?? []) {
    try {
      const { decision, reason } = await judge(row.text);
      await rpc('finish_line_review', { p_profile: row.profile_id, p_text: row.text, p_decision: decision, p_reason: reason });
      totals.reviewed++;
      totals[decision]++;
      // Ids and outcomes only in the log: never the line.
      console.log(JSON.stringify({ event: 'line_review', profile: row.profile_id, decision }));
    } catch (e) {
      // Left claimed; it is retried after two minutes, three tries in all, then waits for a person.
      totals.failed++;
      console.log(JSON.stringify({ event: 'line_review_failed', profile: row.profile_id, error: e instanceof Error ? e.name : 'error' }));
    }
  }
  return json(totals);
});
