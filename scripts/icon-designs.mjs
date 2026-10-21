// One design pixel maps to one screen pixel in the 24px VS Code activity bar.
// Keeping every stroke on this grid avoids the uneven 1.5px scaling of 16px art.
export const GRID_SIZE = 24;

function makeIcon(name, ids, color, draw) {
  const grid = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill('.'));
  const p = (x, y) => {
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= GRID_SIZE || y >= GRID_SIZE) {
      throw new Error(`Pixel outside ${name}: ${x},${y}`);
    }
    grid[y][x] = '#';
  };
  const clear = (x, y) => { grid[y][x] = '.'; };
  const h = (x1, x2, y) => { for (let x = x1; x <= x2; x++) p(x, y); };
  const v = (x, y1, y2) => { for (let y = y1; y <= y2; y++) p(x, y); };
  const r = (x1, y1, x2, y2) => { h(x1, x2, y1); h(x1, x2, y2); v(x1, y1, y2); v(x2, y1, y2); };
  const line = (x1, y1, x2, y2) => {
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
    for (let i = 0; i <= steps; i++) p(Math.round(x1 + (x2 - x1) * i / steps), Math.round(y1 + (y2 - y1) * i / steps));
  };
  draw({ p, clear, h, v, r, line });
  const pixels = grid.map((row) => row.join(''));
  const occupied = pixels.flatMap((row, y) => [...row].flatMap((cell, x) => cell === '#' ? [[x, y]] : []));
  if (!occupied.length) throw new Error(`Empty icon: ${name}`);
  const bounds = [Math.min(...occupied.map(([x]) => x)), Math.min(...occupied.map(([, y]) => y)), Math.max(...occupied.map(([x]) => x)), Math.max(...occupied.map(([, y]) => y))];
  if (bounds.some((n) => n < 1 || n > 22)) throw new Error(`Misaligned ${name}: ${bounds}`);
  return { name, ids, color, pixels };
}

const mint = '#BCEBCB';
const violet = '#C7AAFF';
const gold = '#F2CC91';

export const icons = [
  makeIcon('grimoire', ['explorer-view-icon', 'files', 'open-editors-view-icon', 'book'], mint, ({ p, h, v }) => {
    h(8, 21, 2); v(21, 2, 18); v(8, 2, 5);
    h(3, 18, 5); v(3, 5, 21); v(18, 5, 21); h(3, 18, 21);
    h(7, 14, 9); h(7, 14, 12); h(7, 12, 15); p(7, 18); p(10, 18);
  }),
  makeIcon('search-crystal', ['search-view-icon', 'search'], mint, ({ p, h, v }) => {
    h(7, 10, 2); h(5, 6, 3); h(11, 12, 3);
    p(4, 4); p(13, 4); p(3, 5); p(14, 5);
    v(2, 6, 11); v(15, 6, 11);
    p(3, 12); p(14, 12); p(4, 13); p(13, 13);
    h(5, 6, 14); h(11, 12, 14); h(7, 10, 15);
    p(15, 15); p(16, 16); p(17, 17); p(18, 18); p(19, 19); p(20, 20); p(21, 21); p(22, 22);
  }),
  makeIcon('rune-branch', ['source-control-view-icon', 'source-control'], mint, ({ r, v, line }) => {
    r(2, 2, 6, 6); r(16, 2, 20, 6); r(2, 17, 6, 21);
    v(4, 7, 16); v(18, 7, 10); line(18, 10, 5, 17);
  }),
  makeIcon('spell-arrow', ['run-view-icon', 'debug-alt'], gold, ({ h }) => {
    for (let y = 2; y <= 21; y++) {
      const width = 2 + Math.round((9.5 - Math.abs(11.5 - y)) * 1.7);
      h(4, Math.min(21, 4 + width), y);
    }
  }),
  makeIcon('rune-tiles', ['extensions-view-icon', 'extensions'], mint, ({ p, r }) => {
    r(2, 2, 9, 9); r(14, 2, 21, 9); r(2, 14, 9, 21); r(14, 14, 21, 21);
    p(5, 5); p(18, 5); p(5, 18); p(18, 18);
  }),
  makeIcon('cauldron', ['terminal-view-icon', 'terminal'], mint, ({ h, r, line }) => {
    r(2, 3, 21, 20); line(6, 8, 10, 11); line(10, 12, 6, 15);
    h(13, 17, 15);
  }),
  makeIcon('rune-gear', ['settings-view-bar-icon', 'settings-gear', 'gear'], mint, ({ p, h, v, r }) => {
    h(9, 14, 2); h(9, 14, 21); h(5, 8, 4); h(15, 18, 4); h(5, 8, 19); h(15, 18, 19);
    v(2, 9, 14); v(21, 9, 14); v(7, 3, 5); v(16, 3, 5); v(7, 18, 20); v(16, 18, 20);
    p(4, 5); p(19, 5); p(4, 18); p(19, 18);
    h(3, 5, 7); h(18, 20, 7); h(3, 5, 16); h(18, 20, 16);
    v(5, 8, 15); v(18, 8, 15); h(8, 15, 5); h(8, 15, 18);
    r(9, 9, 14, 14);
  }),
  makeIcon('potion', ['test-view-icon', 'beaker'], mint, ({ p, h, v, line }) => {
    h(9, 14, 2); v(9, 3, 8); v(14, 3, 8); h(9, 14, 8);
    line(9, 9, 4, 15); line(14, 9, 19, 15);
    v(3, 16, 18); v(20, 16, 18); h(4, 19, 19); h(6, 17, 21);
    p(5, 20); p(18, 20); h(6, 17, 16); p(9, 13); p(14, 12); p(12, 18);
  }),
  makeIcon('hooded-account', ['accounts-view-bar-icon', 'account'], violet, ({ p, h, v, line }) => {
    h(9, 14, 2); h(7, 16, 3); p(6, 4); p(17, 4); v(5, 5, 10); v(18, 5, 10);
    p(6, 11); p(17, 11); h(8, 15, 13); h(9, 14, 9); p(9, 10); p(14, 10);
    line(7, 14, 3, 18); line(16, 14, 20, 18); v(2, 19, 20); v(21, 19, 20); h(3, 20, 21);
  }),
  makeIcon('rune-bell', ['bell'], gold, ({ p, h, v }) => {
    h(11, 12, 2); h(9, 14, 4); h(7, 16, 5); p(8, 3); p(15, 3);
    v(6, 6, 17); v(17, 6, 17); p(5, 18); p(18, 18); h(4, 19, 19); h(10, 13, 21);
  }),
  makeIcon('rune-outline', ['outline-view-icon', 'symbol-class'], mint, ({ p, h, v }) => {
    v(3, 3, 20); v(20, 3, 20); h(3, 20, 3); h(3, 20, 20);
    h(7, 16, 7); h(7, 13, 11); h(7, 16, 15); p(7, 17);
  }),
  makeIcon('scroll-output', ['output-view-icon', 'output'], mint, ({ p, h, v }) => {
    h(5, 18, 2); h(5, 18, 21); v(4, 3, 20); v(19, 3, 20);
    h(7, 16, 7); h(7, 14, 11); h(7, 16, 15); p(7, 18);
  }),
  makeIcon('abyss-portal', ['remote-explorer-view-icon', 'remote-explorer'], violet, ({ p, h, v, line }) => {
    h(8, 15, 2); h(6, 17, 3); p(5, 4); p(18, 4); v(4, 5, 20); v(19, 5, 20); h(4, 19, 21);
    h(9, 14, 7); p(8, 8); p(15, 8); v(7, 9, 18); v(16, 9, 18); h(7, 16, 19);
    line(10, 17, 11, 13); line(13, 13, 14, 17);
  }),
  makeIcon('debug-beetle', ['debug-console-view-icon', 'debug-console', 'debug'], mint, ({ p, clear, h, line }) => {
    // Solid rounded wings, a separate head, antennae and six angled legs.
    h(7, 8, 2); p(9, 3); p(14, 3); h(15, 16, 2);
    h(10, 13, 4); h(9, 14, 5); h(9, 14, 6); h(10, 13, 7);
    for (const [y, from, to] of [
      [8, 10, 13], [9, 8, 15], [10, 7, 16], [11, 6, 17],
      [12, 6, 17], [13, 5, 18], [14, 5, 18], [15, 6, 17],
      [16, 6, 17], [17, 7, 16], [18, 8, 15], [19, 10, 13]
    ]) h(from, to, y);
    for (let y = 10; y <= 18; y++) { clear(11, y); clear(12, y); }
    for (const x of [8, 9, 14, 15]) for (const y of [12, 13]) clear(x, y);
    clear(10, 5); clear(13, 5);
    line(6, 11, 2, 9); line(17, 11, 21, 9);
    h(2, 4, 14); h(19, 21, 14);
    line(6, 17, 2, 20); line(17, 17, 21, 20);
  })
];
