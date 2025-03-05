export type ParameterizedAnyValueString<T> = string & {
  __sentry_template_string__?: string;
  __sentry_template_values__?: T[];
};

export type ParameterizedString = ParameterizedAnyValueString<string>;
