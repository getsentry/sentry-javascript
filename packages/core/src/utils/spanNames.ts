/**
 * Given an array of template strings by the format `static string {key0} string... {key1}`,
 * replace the keys with the values of the data object's matching keys.
 *
 * Goes through the array by original order and returns the first matching template
 * candidate that includes all non-empty keys.
 *
 * @param templates - An array of template strings by the format
 *                    `static string {key0} string... {key1}`
 * @param data - An object with the keys to be replaced in the templates. Non-string values are ignored.
 * @returns The populated span name, or an empty string if no matching template is found
 */
export function buildSpanName(templates: string[], data: Record<string, unknown>) {
  const sanitizedDataKeys: string[] = [];
  const sanitizedData: Record<string, string> = Object.keys(data).reduce((acc: Record<string, string>, key) => {
    if (typeof data[key] === 'string') {
      acc[key] = data[key];
      sanitizedDataKeys.push(key);
    }
    return acc;
  }, {});

  for (const template of templates) {
    const keysInTemplate = template.match(/{([^}]+)}/g)?.map(k => k.slice(1, -1)) || [];

    if (!keysInTemplate.every(k => sanitizedDataKeys.includes(k) && sanitizedData[k]?.trim().length)) {
      continue;
    }

    let spanName = template;
    keysInTemplate.forEach(k => {
      const value = sanitizedData[k];
      // replace all matching keys (could use replaceAll once we bump language level support)
      spanName = spanName.split(`{${k}}`).join(value);
    });
    return spanName;
  }
  return '';
}
