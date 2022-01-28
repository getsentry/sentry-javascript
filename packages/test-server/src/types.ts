export interface EnvelopeHeaders {
  event_id: string;
  dsn: string;
  client: string;
  version: number;
  remote_addr: string;
  forwarded_for: string;
  user_agent: string;
  sent_at: string;
}

export interface ItemHeaders {
  type: string;
  length: number;
  content_type?: string;
  attachment_type?: string;
  filename?: string;
}

export interface Item {
  headers: ItemHeaders;
  payload?: Event;
}

export interface Envelope {
  headers: EnvelopeHeaders;
  items: Item[];
}

export interface Event {
  breadcrumbs?: Breadcrumbs;
  contexts?: Contexts;
  environment?: string;
  event_id: string;
  ingest_path?: IngestPath[];
  level?: string;
  platform?: string;
  release?: string;
  sdk?: SDK;
  tags?: Array<string[]>;
  user?: User;
  debug_meta?: DebugMeta;
  measurements?: Record<string, any>;
  request?: Request;
  spans?: Span[];
  start_timestamp?: number;
  timestamp?: number;
  transaction?: string;
  type?: string;
  exception?: Exception;
  extra?: Record<string, any>;
}

export interface Breadcrumbs {
  values: Breadcrumb[];
}

export interface Breadcrumb {
  category?: string;
  message?: string;
  timestamp: number;
  type?: string;
  data?: Record<string, any>;
  level?: string;
}

export interface Contexts extends Record<string, Record<string, any | Trace> | undefined> {
  app?: App;
  browser?: Record<string, any>;
  device?: Device;
  os?: Record<string, any>;
  runtime?: Record<string, any>;
  trace?: Trace;
}

export interface App {
  app_name?: string;
  app_start_time?: Date;
  app_version?: string;
  type?: string;
}

export interface Device {
  arch?: string;
  cpu_description?: string;
  family?: string;
  free_memory?: number;
  language?: string;
  memory_size?: number;
  processor_count?: number;
  processor_frequency?: number;
  screen_density?: number;
  screen_resolution?: string;
  type?: string;
}

export interface Trace {
  op?: string;
  span_id: string;
  tags?: Record<string, string>;
  trace_id: string;
  type: string;
}

export interface DebugMeta {
  transactionSampling?: TransactionSampling;
}

export interface TransactionSampling {
  method?: string;
  rate?: number;
}

export interface Exception {
  values?: ExceptionValue[];
}

export interface ExceptionValue {
  mechanism?: Mechanism;
  stacktrace?: Stacktrace;
  type?: string;
  value?: string;
}

export interface Mechanism {
  handled?: boolean;
  type?: string;
}

export interface Stacktrace {
  frames?: Frame[];
}

export interface Frame {
  colno?: number;
  filename?: string;
  function?: string;
  in_app?: boolean;
  lineno?: number;
  module?: string;
  context_line?: string;
  post_context?: string[];
  pre_context?: string[];
}

export interface IngestPath {
  version: string;
}

export interface Request {
  url?: string;
}

export interface SDK {
  name?: string;
  packages?: Package[];
  version?: string;
  integrations?: string[];
}

export interface Package {
  name?: string;
  version?: string;
}

export interface Span {
  description?: string;
  op?: string;
  parent_span_id?: string;
  span_id?: string;
  start_timestamp?: number;
  timestamp?: number;
  trace_id?: string;
}

export interface User extends Record<string, any> {
  ip_address?: string;
  id?: string;
}
