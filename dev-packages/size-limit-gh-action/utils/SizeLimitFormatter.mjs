import bytes from 'bytes';

const SIZE_RESULTS_HEADER = ['Path', 'Size', '% Change', 'Change'];

const EmptyResult = {
  name: '-',
  size: 0,
};

export class SizeLimitFormatter {
  formatBytes(size) {
    return bytes.format(size, { unitSeparator: ' ' });
  }

  formatSizeLimitResult(size, sizeLimit, passed) {
    if (passed) {
      return this.formatBytes(size);
    }

    return `⛔️ ${this.formatBytes(size)} (max: ${this.formatBytes(sizeLimit)})`;
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

  formatLine(value, change) {
    return `${value} (${change})`;
  }

  formatSizeResult(name, base, current) {
    return [
      name,
      this.formatSizeLimitResult(current.size, current.sizeLimit, current.passed),
      this.formatPercentageChange(base.size, current.size),
      this.formatChange(base.size, current.size),
    ];
  }

  parseResults(output) {
    const results = JSON.parse(output);

    return results.reduce((current, result) => {
      return {
        // biome-ignore lint/performance/noAccumulatingSpread: <explanation>
        ...current,
        [result.name]: {
          name: result.name,
          size: +result.size,
          sizeLimit: +result.sizeLimit,
          passed: result.passed || false,
        },
      };
    }, {});
  }

  hasSizeChanges(base, current, threshold = 0) {
    const names = [...new Set([...(base ? Object.keys(base) : []), ...Object.keys(current)])];

    return !!names.find(name => {
      const baseResult = base?.[name] || EmptyResult;
      const currentResult = current[name] || EmptyResult;

      if (baseResult.size === 0 && currentResult.size === 0) {
        return true;
      }

      return Math.abs((currentResult.size - baseResult.size) / baseResult.size) * 100 > threshold;
    });
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
