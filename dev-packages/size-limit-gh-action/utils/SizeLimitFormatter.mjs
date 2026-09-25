import bytes from 'bytes-iec';

export const MAX_INCREASE_BYTES = 500;

const SIZE_RESULTS_HEADER = ['Path', 'Size', '% Change', 'Change'];

const EmptyResult = {
  name: '-',
  size: 0,
};

export class SizeLimitFormatter {
  formatBytes(size) {
    return bytes.format(size, { unitSeparator: ' ' });
  }

  formatPercentageChange(base = 0, current = 0) {
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

    if (value === 0) {
      return '-';
    }

    return `${formatted}%`;
  }

  formatChange(base = 0, current = 0) {
    if (base === 0) {
      return 'added';
    }

    if (current === 0) {
      return 'removed';
    }

    const value = current - base;
    const formatted = this.formatBytes(value);

    if (value > 0) {
      return `+${formatted} 🔺`;
    }

    if (value === 0) {
      return '-';
    }

    return `${formatted} 🔽`;
  }

  formatSizeResult(name, base, current) {
    return [
      name,
      this.formatBytes(current.size),
      this.formatPercentageChange(base.size, current.size),
      this.formatChange(base.size, current.size),
    ];
  }

  parseResults(output) {
    const results = JSON.parse(output);

    if (!Array.isArray(results) || results.length === 0) {
      throw new Error('Expected non-empty size-limit results.');
    }

    return results.reduce((current, result) => {
      if (!result || typeof result.name !== 'string' || !Number.isFinite(result.size) || result.size < 0) {
        throw new Error('Invalid size-limit measurement.');
      }

      return {
        ...current,
        [result.name]: {
          name: result.name,
          size: result.size,
        },
      };
    }, {});
  }

  getSizeIncreases(base, current, config) {
    return config
      .filter(({ name, gzip }) => gzip === true && base[name] && current[name])
      .map(({ name }) => ({ name, increase: current[name].size - base[name].size }))
      .filter(({ increase }) => increase > MAX_INCREASE_BYTES);
  }

  formatResults(base, current) {
    const names = [...new Set([...(base ? Object.keys(base) : []), ...Object.keys(current)])];
    const header = SIZE_RESULTS_HEADER;
    const fields = names.map(name => {
      const baseResult = base?.[name] || EmptyResult;
      const currentResult = current[name] || EmptyResult;

      return this.formatSizeResult(name, baseResult, currentResult);
    });

    return [header, ...fields];
  }
}
