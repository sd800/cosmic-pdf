// A narrow visual exception, not a document/photo classifier. Uncertain pages
// retain normal inversion. Samples cover the WHOLE completed base canvas.
const GRID = 8, PREFLIGHT = 32, COARSE = 128, CONFIRM = 257;

// A candidate shade comes from the outer paper edge, then must be confirmed
// across the entire page. Gray paper at/above midgray already darkens normally.
function paperShade(data) {
  if (!data || data.length < 4 || data[3] !== 255) return null;
  const r = data[0], g = data[1], b = data[2], shade = .2126 * r + .7152 * g + .0722 * b;
  return Math.max(r, g, b) - Math.min(r, g, b) <= 6 && shade < 127.5 ? shade : null;
}

// Cheap rejection gate only. Its result can NEVER exempt a page by itself.
function hasDarkPaperBase({ data, width, height }) {
  const shade = paperShade(data);
  if (shade === null) return false;
  let dark = 0;
  for (let y = 0, i = 0; y < height; y++) for (let x = 0; x < width; x++, i += 4) {
    const hi = Math.max(data[i], data[i + 1], data[i + 2]), lo = Math.min(data[i], data[i + 1], data[i + 2]);
    const black = data[i + 3] === 255 && hi - lo <= 8 && Math.abs((hi + lo) / 2 - shade) <= 10;
    if (black) dark++;
    else if (x === 0 || y === 0 || x === width - 1 || y === height - 1) return false;
  }
  return dark / (width * height) >= .9;
}

export function isDarkPaper({ data, width, height } = {}, strength = .96) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < COARSE || height < COARSE ||
      width > CONFIRM || height > CONFIRM || !(data instanceof Uint8ClampedArray) || data.length !== width * height * 4 ||
      !Number.isFinite(strength) || strength < .85 || strength > 1) return false;
  const shade = paperShade(data);
  // For neutral paper, hue rotation preserves luminance. Do not exempt light
  // gray paper that the existing inversion would already make darker.
  if (shade === null || 255 * strength + (1 - 2 * strength) * shade <= shade) return false;
  const counts = new Uint32Array(GRID * GRID), dark = new Uint32Array(GRID * GRID), sums = new Float64Array(GRID * GRID);
  const edges = new Uint32Array(4), edgeDark = new Uint32Array(4);
  const bandX = Math.ceil(width * .025), bandY = Math.ceil(height * .025);
  let darkCount = 0, sum = 0, background = 0, squared = 0, colored = 0;
  for (let y = 0, i = 0; y < height; y++) {
    for (let x = 0; x < width; x++, i += 4) {
      if (data[i + 3] !== 255) return false;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const hi = Math.max(r, g, b), lo = Math.min(r, g, b), luminance = .2126 * r + .7152 * g + .0722 * b;
      const nearPaper = hi - lo <= 6 && Math.abs(luminance - shade) <= 6;
      const tile = Math.floor(y * GRID / height) * GRID + Math.floor(x * GRID / width);
      counts[tile]++; sums[tile] += luminance; sum += luminance;
      if (hi - lo > 24) colored++;
      if (nearPaper) { dark[tile]++; darkCount++; background += luminance; squared += luminance * luminance; }
      // Even a thin white paper margin disqualifies a dark image on white paper.
      if ((x === 0 || y === 0 || x === width - 1 || y === height - 1) && !nearPaper) return false;
      if (x < bandX) { edges[0]++; if (nearPaper) edgeDark[0]++; }
      if (x >= width - bandX) { edges[1]++; if (nearPaper) edgeDark[1]++; }
      if (y < bandY) { edges[2]++; if (nearPaper) edgeDark[2]++; }
      if (y >= height - bandY) { edges[3]++; if (nearPaper) edgeDark[3]++; }
    }
  }
  const total = width * height;
  if (darkCount / total < .97 || Math.abs(sum / total - shade) > 12 || colored / total > .003) return false;
  // A very flat neutral paper bed, not merely a low average exposure.
  if (squared / darkCount - (background / darkCount) ** 2 > 6.25) return false;
  for (let i = 0; i < counts.length; i++) if (dark[i] / counts[i] < .9 || Math.abs(sums[i] / counts[i] - shade) > 28) return false;
  for (let i = 0; i < edges.length; i++) if (edgeDark[i] / edges[i] < .995) return false;
  return true;
}

export function createDarkPaperGuard(pageCount, strength, makeCanvas = () => document.createElement('canvas')) {
  // 0: unknown; 1: normal inversion; 2: preserve original black/gray paper.
  let decisions = new Uint8Array(pageCount), canvas, context, disposed = false;
  const valid = page => Number.isInteger(page) && page > 0 && page <= decisions.length;
  const get = page => valid(page) ? decisions[page - 1] : 1;
  function reject(page) { if (valid(page) && !get(page)) decisions[page - 1] = 1; return get(page); }
  function decide(page, source) {
    if (disposed || !valid(page)) return 1;
    if (get(page)) return get(page);
    reject(page); // Errors and insufficient information never enable an exception.
    if (!source || source.width < CONFIRM || source.height < CONFIRM || !Number.isFinite(strength) || strength < .85 || strength > 1) return 1;
    try {
      canvas ||= makeCanvas();
      context ||= canvas.getContext('2d', { willReadFrequently: true });
      for (const size of [PREFLIGHT, COARSE, CONFIRM]) {
        canvas.width = canvas.height = size;
        context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
        context.drawImage(source, 0, 0, size, size);
        const sample = context.getImageData(0, 0, size, size);
        if (size === PREFLIGHT ? !hasDarkPaperBase(sample) : !isDarkPaper(sample, strength)) return 1;
      }
      decisions[page - 1] = 2;
      return 2;
    } catch { return 1; }
    finally { if (canvas) canvas.width = canvas.height = 0; }
  }
  return { get, reject, decide, destroy() { disposed = true; decisions = new Uint8Array(); if (canvas) canvas.width = canvas.height = 0; canvas = context = null; } };
}
