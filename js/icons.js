// Minimal inline SVG icon set (stroke icons, 24x24).

const PATHS = {
  outline: 'M4 6h16M4 12h10M4 18h16',
  desk: 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4',
  tools: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3zM18 16l.9 2.1L21 19l-2.1.9L18 22l-.9-2.1L15 19l2.1-.9L18 16z',
  export: 'M12 4v11m0 0l-4-4m4 4l4-4M5 20h14',
  sun: 'M12 4V2m0 20v-2M4 12H2m20 0h-2M5.6 5.6L4.2 4.2m15.6 15.6l-1.4-1.4M18.4 5.6l1.4-1.4M4.2 19.8l1.4-1.4M12 8a4 4 0 100 8 4 4 0 000-8z',
  steps: 'M5 6h2m3 0h9M5 12h2m3 0h9M5 18h2m3 0h9',
  arrow: 'M5 12h14m-6-6l6 6-6 6',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  install: 'M12 3v12m0 0l-4-4m4 4l4-4M4 21h16',
};

export function icon(name, size = 22) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', PATHS[name] || '');
  svg.append(path);
  return svg;
}
