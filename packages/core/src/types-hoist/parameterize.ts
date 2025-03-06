export type ParameterizedString<Values = string[]> = string & {
  __sentry_template_string__?: string;
  __sentry_template_values__?: Values;
};
