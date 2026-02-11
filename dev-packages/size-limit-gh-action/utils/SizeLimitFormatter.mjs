import * as core from '@actions/core';
import bytes from 'bytes-iec';

const SIZE_RESULTS_HEADER = ['Path', 'Size', '% Change', 'Change'];

const EmptyResult = {
  name: '-',
  size: 0,
};

export class SizeLimitFormatter {
  formatBytes(size) {
    return bytes.format(size, { unitSeparator: ' ' });
  }

  formatName(name, sizeLimit, passed) {
    if (passed) {
      return name;
    }

    return `⛔️ ${name} (max: ${this.formatBytes(sizeLimit)})`;
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
    if (!current.passed) {
      core.debug(
        `Size limit exceeded for ${name} - ${this.formatBytes(current.size)} > ${this.formatBytes(current.sizeLimit)}`,
      );
    }

    return [
      this.formatName(name, current.sizeLimit, current.passed),
      this.formatBytes(current.size),
      this.formatPercentageChange(base.size, current.size),
      this.formatChange(base.size, current.size),
    ];
  }

  parseResults(output) {
    const results = JSON.parse(output);

    return results.reduce((current, result) => {
      return {
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
    if (!base || !current) {
      return true;
    }

    const names = [...new Set([...Object.keys(base), ...Object.keys(current)])];

    return names.some(name => {
      const baseResult = base[name] || EmptyResult;
      const currentResult = current[name] || EmptyResult;

      if (!baseResult.size || !currentResult.size) {
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
