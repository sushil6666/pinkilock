#!/usr/bin/env node
/**
 * The dependency gate for CI: `npm audit` on what ships (no dev dependencies), failing on any
 * high or critical advisory that is not in security/audit-baseline.json.
 *
 * The baseline is debt, not permission: it lists what was already there when the gate was added
 * (docs/build-plan.md, G23), so that CI can be green today and still stop anything new. Remove a
 * name from it when an upgrade clears it; this script says when that has happened.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const baseline = JSON.parse(readFileSync(new URL('../security/audit-baseline.json', import.meta.url), 'utf8')).accepted;
let report;
try {
  report = JSON.parse(execSync('npm audit --json --omit=dev', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 }));
} catch (e) {
  // npm audit exits non-zero whenever it finds anything; the report is still on stdout.
  if (!e.stdout) {
    console.error('npm audit did not run:', e.message);
    process.exit(2);
  }
  report = JSON.parse(e.stdout);
}

const serious = Object.values(report.vulnerabilities ?? {}).filter((v) => v.severity === 'high' || v.severity === 'critical');
const fresh = serious.filter((v) => !(v.name in baseline));
const cleared = Object.keys(baseline).filter((name) => !serious.some((v) => v.name === name));

console.log(`${serious.length} high or critical advisories in shipped dependencies; ${serious.length - fresh.length} are in the baseline.`);
for (const name of cleared) console.log(`::notice::${name} is no longer flagged: remove it from security/audit-baseline.json`);
if (fresh.length) {
  for (const v of fresh) console.error(`::error::New ${v.severity} advisory: ${v.name} (${v.range}). Upgrade it, or triage it and add it to the baseline with a reason.`);
  process.exit(1);
}
