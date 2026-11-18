import { GLOBAL_OBJ } from '@sentry/core';
import type { NitroAppPlugin } from 'nitropack';
import { RELEASE_GLOBAL } from '../common/release';
import { addReleaseMetaTag } from './releaseMetaTag';

/**
 * Hands the release to the browser SDK through a `<meta>` tag in each page on SolidStart v1 (Nitro v2), so it stays
 * out of the content-hashed client chunks. `withSentry` registers it.
 */
export default (nitroApp => {
  nitroApp.hooks.hook('beforeResponse', (event, response) => {
    // The server bundle's banner sets the global.
    const release = (GLOBAL_OBJ as { [RELEASE_GLOBAL]?: string })[RELEASE_GLOBAL];
    if (!release) {
      return;
    }

    const contentType = event.node.res.getHeader('content-type');
    const body = addReleaseMetaTag(
      response.body,
      release,
      Array.isArray(contentType) ? contentType[0] : contentType?.toString(),
    );
    if (body !== response.body) {
      event.node.res.removeHeader('content-length');
      response.body = body;
    }
  });
}) satisfies NitroAppPlugin;
