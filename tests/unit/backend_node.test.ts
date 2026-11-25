/**
 * The live backend must load in plain Node: tests/live runs it there (PR #92, local-stack
 * "Transform failed ... react-native/index.js: Unexpected typeof"). Anything that needs React
 * Native, such as the platform or Razorpay Checkout, comes in through SupabaseOptions.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

test('the live backend loads with no React Native', async () => {
  const mod = await import('../../src/services/supabase/supabaseBackend');
  assert.equal(typeof mod.createSupabaseBackend, 'function');
});
