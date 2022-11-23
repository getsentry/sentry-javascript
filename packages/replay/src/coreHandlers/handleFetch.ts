import { ReplayPerformanceEntry } from '../createPerformanceEntry';
import { isIngestHost } from '../util/isIngestHost';

interface FetchHandlerData {
  args: Parameters<typeof fetch>;
  fetchData: {
    method: string;
    url: string;
  };
  response: {
    type: string;
    url: string;
    redirected: boolean;
    status: number;
    ok: boolean;
  };
  startTimestamp: number;
  endTimestamp?: number;
}

export function handleFetch(handlerData: FetchHandlerData): null | ReplayPerformanceEntry {
  if (!handlerData.endTimestamp) {
    return null;
  }

  const { startTimestamp, endTimestamp, fetchData, response } = handlerData;

  // Do not capture fetches to Sentry ingestion endpoint
  if (isIngestHost(fetchData.url)) {
    return null;
  }

  return {
    type: 'resource.fetch',
    start: startTimestamp / 1000,
    end: endTimestamp / 1000,
    name: fetchData.url,
    data: {
      method: fetchData.method,
      statusCode: response.status,
    },
  };
}
