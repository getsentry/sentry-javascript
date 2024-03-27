const COLOR_RESET = '\x1b[0m';
const COLORS = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
};

function colorize(str, color) {
  if (!(color in COLORS)) {
    throw new Error(`Unknown color. Available colors: ${Object.keys(COLORS).join(', ')}`);
  }

  return `${COLORS[color]}${str}${COLOR_RESET}`;
}

module.exports = { colorize };
