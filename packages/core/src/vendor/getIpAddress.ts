// Vendored / modified from @sergiodxa/remix-utils

// https://github.com/sergiodxa/remix-utils/blob/02af80e12829a53696bfa8f3c2363975cf59f55e/src/server/get-client-ip-address.ts
// Copyright (c) 2021 Sergio Xalambrí
// SPDX-License-Identifier: MIT

// The headers to check, in priority order
export const ipHeaderNames = [
  'X-Client-IP',
  'X-Forwarded-For',
  'Fly-Client-IP',
  'CF-Connecting-IP',
  'Fastly-Client-Ip',
  'True-Client-Ip',
  'X-Real-IP',
  'X-Cluster-Client-IP',
  'X-Forwarded',
  'Forwarded-For',
  'Forwarded',
  'X-Vercel-Forwarded-For',
];

/**
 * Get the IP address of the client sending a request.
 *
 * It receives a Request headers object and use it to get the
 * IP address from one of the following headers in order.
 *
 * If the IP address is valid, it will be returned. Otherwise, null will be
 * returned.
 *
 * If the header values contains more than one IP address, the first valid one
 * will be returned.
 */
export function getClientIPAddress(headers: { [key: string]: string | string[] | undefined }): string | null {
  // Build a map of lowercase header names to their values for case-insensitive lookup
  // This is needed because headers from different sources may have different casings
  const lowerCaseHeaders: { [key: string]: string | string[] | undefined } = {};

  for (const key of Object.keys(headers)) {
    lowerCaseHeaders[key.toLowerCase()] = headers[key];
  }

  // This will end up being Array<string | string[] | undefined | null> because of the various possible values a header
  // can take
  const headerValues = ipHeaderNames.map((headerName: string) => {
    const rawValue = lowerCaseHeaders[headerName.toLowerCase()];
    const value = Array.isArray(rawValue) ? rawValue.join(';') : rawValue;

    if (headerName === 'Forwarded') {
      return parseForwardedHeader(value);
    }

    return value?.split(',').map((v: string) => v.trim());
  });

  // Flatten the array and filter out any falsy entries
  const flattenedHeaderValues = headerValues.reduce((acc: string[], val) => {
    if (!val) {
      return acc;
    }

    return acc.concat(val);
  }, []);

  // Find the first value which is a valid IP address, if any
  const ipAddress = flattenedHeaderValues.find(ip => ip !== null && isIP(ip));

  return ipAddress || null;
}

function parseForwardedHeader(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  for (const part of value.split(';')) {
    if (part.startsWith('for=')) {
      return part.slice(4);
    }
  }

  return null;
}

//
/**
 * Custom method instead of importing this from `net` package, as this only exists in node
 * Accepts:
 * 127.0.0.1
 * 192.168.1.1
 * 192.168.1.255
 * 255.255.255.255
 * 10.1.1.1
 * 0.0.0.0
 * 2b01:cb19:8350:ed00:d0dd:fa5b:de31:8be5
 *
 * Rejects:
 * 1.1.1.01
 * 30.168.1.255.1
 * 127.1
 * 192.168.1.256
 * -1.2.3.4
 * 1.1.1.1.
 * 3...3
 * 192.168.1.099
 */
function isIP(str: string): boolean {
  const regex =
    /(?:^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)){3}$)|(?:^(?:(?:[a-fA-F\d]{1,4}:){7}(?:[a-fA-F\d]{1,4}|:)|(?:[a-fA-F\d]{1,4}:){6}(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)(?:\\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)){3}|:[a-fA-F\d]{1,4}|:)|(?:[a-fA-F\d]{1,4}:){5}(?::(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)(?:\\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)){3}|(?::[a-fA-F\d]{1,4}){1,2}|:)|(?:[a-fA-F\d]{1,4}:){4}(?:(?::[a-fA-F\d]{1,4}){0,1}:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)(?:\\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)){3}|(?::[a-fA-F\d]{1,4}){1,3}|:)|(?:[a-fA-F\d]{1,4}:){3}(?:(?::[a-fA-F\d]{1,4}){0,2}:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)(?:\\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)){3}|(?::[a-fA-F\d]{1,4}){1,4}|:)|(?:[a-fA-F\d]{1,4}:){2}(?:(?::[a-fA-F\d]{1,4}){0,3}:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)(?:\\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)){3}|(?::[a-fA-F\d]{1,4}){1,5}|:)|(?:[a-fA-F\d]{1,4}:){1}(?:(?::[a-fA-F\d]{1,4}){0,4}:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)(?:\\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)){3}|(?::[a-fA-F\d]{1,4}){1,6}|:)|(?::(?:(?::[a-fA-F\d]{1,4}){0,5}:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)(?:\\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)){3}|(?::[a-fA-F\d]{1,4}){1,7}|:)))(?:%[0-9a-zA-Z]{1,})?$)/;
  return regex.test(str);
}
