export const money = (cents) =>
  cents === null || cents === undefined
    ? '-'
    : 'A$' + (cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const int = (n) => (n === null || n === undefined ? '-' : Number(n).toLocaleString('en-AU'));

export const dec = (n, digits = 1) => (n === null || n === undefined ? '-' : Number(n).toFixed(digits));

export const pct = (x, digits = 1) => (x === null || x === undefined ? '-' : (100 * x).toFixed(digits) + '%');

export const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
