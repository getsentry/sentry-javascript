export type Breadcrumb = {
  type?: string;
  level?: string; // TODO check if same as LogLevel or Severity
  event_id?: string;
  category?: string;
  message?: string;
  data?: any;
};
