type JsonObject = Record<string, unknown>;
type JsonArray = unknown[];

export type NetworkBody = JsonObject | JsonArray | string;

export type NetworkMetaWarning = 'MAYBE_JSON_TRUNCATED' | 'TEXT_TRUNCATED' | 'URL_SKIPPED';

interface NetworkMeta {
  warnings?: NetworkMetaWarning[];
}

export interface ReplayNetworkRequestOrResponse {
  size?: number;
  body?: NetworkBody;
  headers: Record<string, string>;
  _meta?: NetworkMeta;
}
