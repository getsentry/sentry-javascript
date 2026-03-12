import { getDefaultIntegrations, init as initCore } from '@sentry/core';
import { httpIntegration } from './integrations/http';

export const defaultIntegrations = [...getDefaultIntegrations(), httpIntegration()];

export function init(options: any): void {
  const integrations = options.integrations || defaultIntegrations;
  initCore({
    ...options,
    integrations,
  beforeSend(event) {
      if (event.contexts?.response?.headers) {
        const headers = event.contexts.response.headers as Record<string, string | string[] | undefined>;
        const sensitiveHeaders = ['set-cookie', 'cookie', 'authorization'];
        for (const header of sensitiveHeaders) {
          if (headers[header]) {
            headers[header] = '[Filtered]';
          }
        }
      }
      return options.beforeEvent ? options.beforeEvent(event) : event;
    },
  });
}
