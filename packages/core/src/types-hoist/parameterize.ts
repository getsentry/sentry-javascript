export type ParameterizedString = string & {
  __sentry_template_string__?: string;
  __sentry_template_values__?: unknown[];
};
