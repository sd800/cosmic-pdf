// All reader icons share a 24-unit grid, 20px size and the same stroke weight.
const paths = {
  settings:'M4 6h16M4 12h16M4 18h16',
  more:'M13 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0M13 12a1 1 0 1 1-2 0 1 1 0 0 1 2 0M13 19a1 1 0 1 1-2 0 1 1 0 0 1 2 0',
  'fit-width':'M4 4h16v16H4zM7 12h10M9 10l-2 2 2 2M15 10l2 2-2 2',
  'fit-page':'M8 3h8v18H8zM3 8V3h2M19 3h2v5M21 16v5h-2M5 21H3v-5',
  native:'M14 4h6v6M20 4l-9 9M18 13v6H5V6h6',
  'ocr-toggle':'M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M8 8h8M12 8v8',
  'ocr-close':'m5 5 14 14M19 5 5 19',
  properties:'M12.5 4a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0M9 10h3v11M8 21h8',
  print:'M6 9V3h12v6M6 17H3V9h18v8h-3M6 14h12v7H6z',
  download:'M12 3v12M7 10l5 5 5-5M5 21h14',
  moon:'M20.5 13.5A8.5 8.5 0 0 1 10.5 3 8.5 8.5 0 1 0 20.5 13.5Z',
  sun:'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19',
  'search-toggle':'M16 16l5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  'sidebar-toggle':'M3 4h18v16H3zM9 4v16',
  rotate:'M5.25 9.5h9a1.25 1.25 0 0 1 1.25 1.25v9A1.25 1.25 0 0 1 14.25 21h-9A1.25 1.25 0 0 1 4 19.75v-9A1.25 1.25 0 0 1 5.25 9.5ZM20 9.75v-1A3.75 3.75 0 0 0 16.25 5h-3m2.5-2-2.5 2 2.5 2',
  fullscreen:'M9 3H3v6M15 3h6v6M21 15v6h-6M3 15v6h6',
  'fullscreen-exit':'M3 9h6V3M15 3v6h6M21 15h-6v6M9 21v-6H3',
  previous:'m15 4-8 8 8 8', next:'m9 4 8 8-8 8',
  'zoom-out':'M4 12h16', 'zoom-in':'M4 12h16M12 4v16',
  'find-previous':'M12 21V3m-7 7 7-7 7 7', 'find-next':'M12 3v18m-7-7 7 7 7-7', 'find-close':'m5 5 14 14M19 5 5 19'
};
export function setReaderIcon(button, name) {
  if (!button || !paths[name]) return;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', paths[name]); svg.append(path);
  button.classList.add('reader-icon'); button.replaceChildren(svg);
}
export function setReaderIcons(root) {
  for (const name of Object.keys(paths)) setReaderIcon(root.getElementById(name), name);
}
