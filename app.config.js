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
  const local = path.join(__dirname, 'google-services.json');
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON || (fs.existsSync(local) ? './google-services.json' : undefined);
  return {
    ...config,
    android: { ...config.android, ...(googleServicesFile ? { googleServicesFile } : {}) },
  };
};
