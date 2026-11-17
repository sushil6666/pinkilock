/**
 * What this build is: version, git commit and over-the-air update id. Shown at the bottom of Me
 * and sent with every error report, so a bug is always tied to the code that produced it.
 * The commit is stamped at build time (EXPO_PUBLIC_GIT_SHA, set by the EAS build workflow).
 */
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

const version = Constants.expoConfig?.version ?? '0.0.0';
const commit = (process.env.EXPO_PUBLIC_GIT_SHA ?? '').slice(0, 7) || 'dev';
const update = (Updates.updateId ?? '').slice(0, 8);

export const build = { version, commit, update };

/** `0.1.0 abc1234` or, with an over-the-air update applied, `0.1.0 abc1234 u1b2c3d4e`. */
export const buildLabel = [version, commit, update ? `u${update}` : ''].filter(Boolean).join(' ');
