const DEFAULT_EARTH_RENDER_ORDER = [
  "graticules.line",
  "land.line",
  "land.fill",
  "ocean.fill",
];

function normalizeRenderOrder(order = []) {
  const seen = new Set();
  const normalized = [];
  [...order, ...DEFAULT_EARTH_RENDER_ORDER].forEach((id) => {
    if (DEFAULT_EARTH_RENDER_ORDER.includes(id) && !seen.has(id)) {
      seen.add(id);
      normalized.push(id);
    }
  });
  return normalized;
}

export { DEFAULT_EARTH_RENDER_ORDER, normalizeRenderOrder };
