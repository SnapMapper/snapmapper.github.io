// A few line icons, drawn inline (no icon font or files to fetch). Each sits beside a text
// label, never instead of one: the shape helps the eye find a target, the word confirms it.

const NS = 'http://www.w3.org/2000/svg';

const PATHS = {
  zap: ['M13 2 4 14h7l-1 8 9-12h-7l1-8z'],
  play: ['M7 5l12 7-12 7z'],
  flag: ['M5 21V4', 'M5 4h11l-2.5 4L16 12H5'],
  pencil: ['M4 20h4L19 9l-4-4L4 16z', 'M14 6l4 4'],
  undo: ['M9 14 4 9l5-5', 'M4 9h11a5 5 0 0 1 0 10h-3'],
  stop: ['M6 6h12v12H6z'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  clock: ['M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z', 'M12 7v5l3 2'],
  menu: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
  target: ['M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z', 'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8z'],
  route: ['M5 19c3-6 11-8 14-14', 'M5 19h.01', 'M19 5h.01'],
  device: ['M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z', 'M11 18h2'],
};

export function icon(name, cls) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', ['ico', cls].filter(Boolean).join(' '));
  svg.setAttribute('aria-hidden', 'true');
  for (const d of PATHS[name] ?? []) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}
