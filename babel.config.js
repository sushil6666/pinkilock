/**
 * Expo's own preset, plus one thing for production bundles: every `console` call is removed, in
 * the app and in every library bundled with it (WP5, decision D093). The app's logger already
 * prints nothing in production (src/lib/log.ts); this keeps libraries from printing content, such
 * as a server's error text, into the phone's log. Errors still reach us as codes and trace ids
 * through log_client_error. Development builds keep every console call.
 */
module.exports = function config(api) {
  const production = api.caller((caller) => caller?.isDev === false) || process.env.NODE_ENV === 'production';
  api.cache.using(() => String(production));
  return {
    presets: ['babel-preset-expo'],
    plugins: production ? ['transform-remove-console'] : [],
  };
};
