import { WINDOW } from './types';

/**
 * We don't want to start a bunch of idle timers and PerformanceObservers
 * for web crawlers, as they may prevent the page from being seen as "idle"
 * by the crawler's rendering engine (e.g. Googlebot's headless Chromium).
 */
const BOT_USER_AGENT_RE =
  /Googlebot|Google-InspectionTool|Storebot-Google|Bingbot|Slurp|DuckDuckBot|Baiduspider|YandexBot|Facebot|facebookexternalhit|LinkedInBot|Twitterbot|Applebot/i;

/**
 * Whether the current user agent looks like a web crawler.
 */
export function isBotUserAgent(): boolean {
  const nav = WINDOW.navigator as Navigator | undefined;
  if (!nav?.userAgent) {
    return false;
  }
  return BOT_USER_AGENT_RE.test(nav.userAgent);
}
