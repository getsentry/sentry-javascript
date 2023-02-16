// Based off https://www.npmjs.com/package/spider-detector

import { WINDOW } from '../constants';

const BOT_REGEXES = [
  /bot/i,
  /spider/i,
  /facebookexternalhit/i,
  /simplepie/i,
  /yahooseeker/i,
  /embedly/i,
  /quora link preview/i,
  /outbrain/i,
  /vkshare/i,
  /monit/i,
  /Pingability/i,
  /Monitoring/i,
  /WinHttpRequest/i,
  /Apache-HttpClient/i,
  /getprismatic.com/i,
  /python-requests/i,
  /Twurly/i,
  /yandex/i,
  /browserproxy/i,
  /crawler/i,
  /Qwantify/i,
  /Yahoo! Slurp/i,
  /pinterest/i,
  /Tumblr\/14.0.835.186/i,
  /Tumblr Agent 14.0/i,
  /WhatsApp/i,
  /Google-Structured-Data-Testing-Tool/i,
];

/** Check if the current user agent is a bot. */
export function isBot(userAgent = WINDOW.navigator.userAgent): boolean {
  return BOT_REGEXES.some(regex => regex.test(userAgent));
}
