// Heuristics for auto-detecting column roles from header names
const LAT_PATTERNS  = /^(lat(itude)?|y)$/i;
const LNG_PATTERNS  = /^(lon(g)?(itude)?|lng|x)$/i;
const FROM_PATTERNS = /^(date|time|start|valid_from|from|timestamp|year)$/i;
const TO_PATTERNS   = /^(end|valid_to|to|end_date|end_time)$/i;
const LABEL_PATTERNS = /^(name|label|title|place|location|description)$/i;

export function detectColumns(headers) {
  const mapping = { lat: null, lng: null, valid_from: null, valid_to: null, label: null };
  for (const h of headers) {
    if (!mapping.lat       && LAT_PATTERNS.test(h))   mapping.lat       = h;
    else if (!mapping.lng  && LNG_PATTERNS.test(h))   mapping.lng       = h;
    if (!mapping.valid_from && FROM_PATTERNS.test(h)) mapping.valid_from = h;
    if (!mapping.valid_to   && TO_PATTERNS.test(h))   mapping.valid_to   = h;
    if (!mapping.label      && LABEL_PATTERNS.test(h)) mapping.label     = h;
  }
  return mapping;
}

export function rowsToFeatures(rows, mapping) {
  const features = [];
  for (const row of rows) {
    const lat = parseFloat(row[mapping.lat]);
    const lng = parseFloat(row[mapping.lng]);
    if (!isFinite(lat) || !isFinite(lng)) continue;

    const properties = {};
    for (const [col, val] of Object.entries(row)) {
      if (col === mapping.lat || col === mapping.lng) continue;
      if (val !== "" && val !== null && val !== undefined) {
        properties[col] = val;
      }
    }

    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lng, lat] },
      properties,
      valid_from: mapping.valid_from ? row[mapping.valid_from] || null : null,
      valid_to:   mapping.valid_to   ? row[mapping.valid_to]   || null : null,
    });
  }
  return features;
}
