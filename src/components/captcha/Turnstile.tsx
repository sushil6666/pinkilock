/**
 * Cloudflare Turnstile on a phone: a small web page in a WebView, served as if from TURNSTILE_PAGE
 * (a hostname allowed for the site key), that posts the token back. A phone build from before
 * react-native-webview was added has no WebView: it says so (PA011), and the person updates.
 */
import { useEffect } from 'react';
import { View } from 'react-native';
import { AppError } from '../../domain/errors';
import { TURNSTILE_PAGE, TURNSTILE_SITE_KEY } from '../../lib/captcha';

type WebViewModule = typeof import('react-native-webview');

function webView(): WebViewModule | null {
  try {
    // Loaded here, not at the top: an older binary has no native WebView to load.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-webview') as WebViewModule;
  } catch {
    // An older phone build: it cannot show the check, so it says to update.
    return null;
  }
}

const page = (siteKey: string) => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
<style>html,body{margin:0;background:transparent;display:flex;justify-content:center}</style></head><body><!-- i18n: data (markup, not words) -->
<div class="cf-turnstile" data-sitekey="${siteKey}" data-theme="dark" data-callback="ok" data-error-callback="bad" data-expired-callback="bad"></div>
<script>function ok(t){window.ReactNativeWebView.postMessage(JSON.stringify({token:t}))}function bad(){window.ReactNativeWebView.postMessage(JSON.stringify({error:true}))}</script>
</body></html>`;

export function Turnstile({ onToken, onError }: { onToken(token: string): void; onError(e: unknown): void }) {
  const m = webView();
  useEffect(() => {
    if (!m) onError(new AppError('PA011'));
  }, [m, onError]);
  if (!m) return null;
  const { WebView } = m;
  return (
    <View style={{ height: 80 }}>
      <WebView
        source={{ html: page(TURNSTILE_SITE_KEY.replace(/[^\w-]/g, '')), baseUrl: TURNSTILE_PAGE }}
        originWhitelist={['*']}
        style={{ backgroundColor: 'transparent' }}
        onMessage={(e) => {
          const msg = JSON.parse(e.nativeEvent.data) as { token?: string; error?: boolean };
          if (msg.token) onToken(msg.token);
          else onError(new AppError('PA010'));
        }}
        onError={() => onError(new AppError('PC001'))}
      />
    </View>
  );
}
