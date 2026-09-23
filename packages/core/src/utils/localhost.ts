import type { RequestEventData } from '../types/request';
import { isURLObjectRelative, parseStringToURLObject } from './url';

// These mirror Relay's inbound localhost filter (relay-filter/src/localhost.rs) exactly. Any
// divergence would make the SDK and Relay classify the same traffic differently, so do not blindly
// "improve" this list (no 0.0.0.0, no .local/.test, no private LAN ranges, no 127.0.0.0/8).

const LOCAL_IPS = ['127.0.0.1', '::1'];
const LOCAL_DOMAINS = ['127.0.0.1', 'localhost'];
const HOST_HEADERS = ['host', 'x-forwarded-host'];

/**
 * Whether a request looks like it was served from the developer's own machine.
 *
 * Ported from Relay's localhost inbound filter so that spans and events are judged by the same rule.
 */
export function isLocalhostRequest(request: RequestEventData | undefined, ipAddress?: string | null): boolean {
  if (ipAddress && LOCAL_IPS.includes(ipAddress)) {
    return true;
  }

  const url = request?.url ? parseStringToURLObject(request.url) : undefined;
  if (url && !isURLObjectRelative(url)) {
    // Checked before the hostname, which is empty for `file:///path/to/index.html`.
    if (url.protocol === 'file:') {
      return true;
    }

    if (LOCAL_DOMAINS.some(domain => hostMatchesOrIsSubdomainOf(url.hostname, domain))) {
      return true;
    }
  }

  const headers = request?.headers;
  if (headers) {
    // HTTP header names are case-insensitive. Node and the Fetch API lower-case them, but
    // `normalizedRequest` can also be built by hand, so the lookup does not rely on that.
    for (const [name, value] of Object.entries(headers)) {
      if (!HOST_HEADERS.includes(name.toLowerCase())) {
        continue;
      }

      // Host headers usually look like "localhost:3000", so drop the port. Relay compares the result
      // exactly rather than via `hostMatchesOrIsSubdomainOf`, so "foo.localhost" here does not match.
      const host = value?.split(':')[0];
      if (host && LOCAL_DOMAINS.includes(host)) {
        return true;
      }
    }
  }

  return false;
}

function hostMatchesOrIsSubdomainOf(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}
