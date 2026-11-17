/**
 * app.json is the app's config; this file only adds what cannot be static.
 *
 * Android push goes through Firebase Cloud Messaging, which needs a google-services.json in the
 * build. It is not in the repo: on EAS it arrives as the file variable GOOGLE_SERVICES_JSON, and
 * locally you can drop the file next to this one (it is git-ignored). Without it the app still
 * builds and runs; only push stays off, and the Me tab says why.
 */
const fs = require('fs');
const path = require('path');

module.exports = ({ config }) => {
  // A store build must talk to a real backend (src/services/index.ts also refuses at run time).
  if (process.env.EAS_BUILD_PROFILE === 'production' && !(process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY)) {
    throw new Error('Production build without EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY: refusing to build an app that would run on mock data.');
  }
  // Over-the-air updates are code signed once a certificate exists (scripts/codesign-setup.sh;
  // OPERATIONS.md, "Signed updates"). The private key never enters the repo.
  const cert = path.join(__dirname, 'code-signing', 'certificate.pem');
  const updates = fs.existsSync(cert)
    ? { ...config.updates, codeSigningCertificate: './code-signing/certificate.pem', codeSigningMetadata: { keyid: 'main', alg: 'rsa-v1_5-sha256' } }
    : config.updates;
  const local = path.join(__dirname, 'google-services.json');
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON || (fs.existsSync(local) ? './google-services.json' : undefined);
  return {
    ...config,
    updates,
    android: { ...config.android, ...(googleServicesFile ? { googleServicesFile } : {}) },
  };
};
