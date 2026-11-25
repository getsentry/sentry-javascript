import bytes from 'bytes-iec';

export const MAX_INCREASE_BYTES = 500;

export function parseResults(output) {
  return Object.fromEntries(JSON.parse(output).map(({ name, size }) => [name, { name, size }]));
}

export function getSizeIncreases(base, current, config) {
  return config
    .filter(({ name, gzip }) => gzip === true && base[name])
    .map(({ name }) => ({ name, increase: current[name].size - base[name].size }))
    .filter(({ increase }) => increase > MAX_INCREASE_BYTES);
}

export function formatResults(base, current) {
  const names = [...new Set([...Object.keys(base ?? {}), ...Object.keys(current)])];

  return [
    ['Path', 'Size', '% Change', 'Change'],
    ...names.map(name => {
      const baseSize = base?.[name]?.size ?? 0;
      const currentSize = current[name]?.size ?? 0;
      return [
        name,
        formatBytes(currentSize),
        formatPercentageChange(baseSize, currentSize),
        formatChange(baseSize, currentSize),
      ];
    }),
  ];
}

function formatBytes(size) {
  return bytes.format(size, { unitSeparator: ' ' });
}

function formatPercentageChange(base, current) {
  if (base === 0) {
    return 'added';
  }
  if (current === 0) {
    return 'removed';
  }

  const value = ((current - base) / base) * 100;
  const formatted = (Math.sign(value) * Math.ceil(Math.abs(value) * 100)) / 100;

  if (value > 0) {
    return `+${formatted}%`;
  }
  return value === 0 ? '-' : `${formatted}%`;
}

function formatChange(base, current) {
  if (base === 0) {
    return 'added';
  }
  if (current === 0) {
    return 'removed';
  }

  const value = current - base;

  if (value > 0) {
    return `+${formatBytes(value)} 🔺`;
  }
  return value === 0 ? '-' : `${formatBytes(value)} 🔽`;
}
