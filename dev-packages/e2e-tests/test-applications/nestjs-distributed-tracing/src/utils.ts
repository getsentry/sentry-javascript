import * as Sentry from '@sentry/nestjs';
import * as http from 'http';

export function makeHttpRequest(url) {
  return new Promise(resolve => {
    const data = [];

    http
      .request(url, httpRes => {
        httpRes.on('data', chunk => {
          data.push(chunk);
        });
        httpRes.on('error', error => {
          resolve({ error: error.message, url });
        });
        httpRes.on('end', () => {
          try {
            const json = JSON.parse(Buffer.concat(data).toString());
            resolve(json);
          } catch {
            resolve({ data: Buffer.concat(data).toString(), url });
          }
        });
      })
      .end();
  });
}

/**
 * Streamed spans carry no scope data, so the specs read what the isolation scope holds from these
 * attributes on the enclosing segment span instead.
 */
export function reportIsolationScopeOnSpan() {
  const activeSpan = Sentry.getActiveSpan();
  if (!activeSpan) {
    return;
  }

  const scopeData = Sentry.getIsolationScope().getScopeData();
  Sentry.getRootSpan(activeSpan).setAttributes({
    'isolation_scope.tag_keys': Object.keys(scopeData.tags),
    'isolation_scope.breadcrumb_messages': scopeData.breadcrumbs.map(breadcrumb => breadcrumb.message ?? ''),
  });
}
