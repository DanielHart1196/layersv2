import { zxyToTileId } from "pmtiles";

// PMTiles v3 writer — assembles a binary PMTiles archive from tile data.
// Spec: https://github.com/protomaps/PMTiles/blob/main/spec/v3/spec.md

const HEADER_SIZE = 127;
const MAGIC = 0x4d19;
const MAX_DIR_BYTES = 16384;

// ── Varint ────────────────────────────────────────────────────────────────────

function writeVarint(value, out) {
  let v = value;
  while (v > 0x7f) {
    out.push((v & 0x7f) | 0x80);
    v = Math.floor(v / 128); // avoid >>> to stay safe above 2^31
  }
  out.push(v & 0x7f);
}

// ── Directory ─────────────────────────────────────────────────────────────────

// entries: [{tileId, offset, length, runLength}], sorted ascending by tileId.
// runLength = 0 → leaf-directory pointer; > 0 → tile data entry.
function serializeEntries(entries) {
  const buf = [];
  writeVarint(entries.length, buf);

  let prevId = 0;
  for (const e of entries) {
    writeVarint(e.tileId - prevId, buf);
    prevId = e.tileId;
  }
  for (const e of entries) writeVarint(e.runLength, buf);
  for (const e of entries) writeVarint(e.length, buf);

  let prevEnd = 0;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (i > 0 && e.runLength > 0 && e.offset === prevEnd) {
      writeVarint(0, buf); // delta: offset = prev.offset + prev.length
    } else {
      writeVarint(e.offset + 1, buf); // absolute: stored as value + 1
    }
    prevEnd = e.offset + e.length;
  }

  return new Uint8Array(buf);
}

function buildDirectories(entries) {
  const rootAttempt = serializeEntries(entries);
  if (rootAttempt.length <= MAX_DIR_BYTES) {
    return { rootDir: rootAttempt, leafDirs: new Uint8Array(0) };
  }

  // Partition entries into leaf dirs of <= MAX_DIR_BYTES each.
  const leafParts = [];
  let i = 0;
  while (i < entries.length) {
    // Binary search for max entries that still fit.
    let lo = 1;
    let hi = Math.min(entries.length - i, MAX_DIR_BYTES); // rough upper bound
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (serializeEntries(entries.slice(i, i + mid)).length <= MAX_DIR_BYTES) lo = mid;
      else hi = mid - 1;
    }
    leafParts.push(entries.slice(i, i + lo));
    i += lo;
  }

  // Concatenate leaf dirs and build root entries.
  const leafDirArrays = leafParts.map(serializeEntries);
  const totalLeafSize = leafDirArrays.reduce((s, a) => s + a.length, 0);
  const leafDirs = new Uint8Array(totalLeafSize);
  const rootEntries = [];
  let leafOffset = 0;
  for (let k = 0; k < leafParts.length; k++) {
    rootEntries.push({
      tileId: leafParts[k][0].tileId,
      offset: leafOffset,
      length: leafDirArrays[k].length,
      runLength: 0,
    });
    leafDirs.set(leafDirArrays[k], leafOffset);
    leafOffset += leafDirArrays[k].length;
  }

  return { rootDir: serializeEntries(rootEntries), leafDirs };
}

// ── Header ────────────────────────────────────────────────────────────────────

function setUint64LE(view, offset, value) {
  // Split 53-bit-safe integer into two 32-bit words.
  const lo = value >>> 0;
  const hi = Math.floor(value / 0x100000000) >>> 0;
  view.setUint32(offset, lo, true);
  view.setUint32(offset + 4, hi, true);
}

// ── Public API ────────────────────────────────────────────────────────────────

// tiles: Array of { z, x, y, data: Uint8Array }
// Returns a Uint8Array containing the complete PMTiles v3 file.
export function buildPMTiles({ tiles, minZoom = 0, maxZoom = 14, bounds = [-180, -90, 180, 90] }) {
  // Sort tiles by Hilbert tile ID for clustering.
  const sorted = tiles
    .map((t) => ({ ...t, tileId: zxyToTileId(t.z, t.x, t.y) }))
    .sort((a, b) => a.tileId - b.tileId);

  // Build tile data buffer + entry list.
  const tileDataParts = sorted.map((t) => t.data);
  const totalTileBytes = tileDataParts.reduce((s, d) => s + d.length, 0);
  const tileData = new Uint8Array(totalTileBytes);
  const entries = [];
  let pos = 0;
  for (const t of sorted) {
    tileData.set(t.data, pos);
    entries.push({ tileId: t.tileId, offset: pos, length: t.data.length, runLength: 1 });
    pos += t.data.length;
  }

  const { rootDir, leafDirs } = buildDirectories(entries);

  const metadataBytes = new TextEncoder().encode(JSON.stringify({ name: "atlas-layer" }));

  const rootDirOffset   = HEADER_SIZE;
  const metadataOffset  = rootDirOffset  + rootDir.length;
  const leafDirsOffset  = metadataOffset + metadataBytes.length;
  const tileDataOffset  = leafDirsOffset + leafDirs.length;
  const totalSize       = tileDataOffset + tileData.length;

  const out  = new Uint8Array(totalSize);
  const view = new DataView(out.buffer);

  // Magic + version
  view.setUint16(0, MAGIC, true);
  view.setUint8(2, 3);

  // Offsets & lengths (all uint64 LE)
  setUint64LE(view, 3,  rootDirOffset);
  setUint64LE(view, 11, rootDir.length);
  setUint64LE(view, 19, metadataOffset);
  setUint64LE(view, 27, metadataBytes.length);
  setUint64LE(view, 35, leafDirsOffset);
  setUint64LE(view, 43, leafDirs.length);
  setUint64LE(view, 51, tileDataOffset);
  setUint64LE(view, 59, tileData.length);
  setUint64LE(view, 67, entries.length); // addressed tiles
  setUint64LE(view, 75, entries.length + (leafDirs.length > 0 ? 1 : 0)); // tile entries
  setUint64LE(view, 83, entries.length); // tile contents (unique)

  out[91] = 1; // clustered
  out[92] = 1; // internal compression: none
  out[93] = 1; // tile compression: none
  out[94] = 1; // tile type: MVT

  out[95] = minZoom;
  out[96] = maxZoom;

  view.setInt32(97,  Math.round(bounds[0] * 1e7), true); // min lon
  view.setInt32(101, Math.round(bounds[1] * 1e7), true); // min lat
  view.setInt32(105, Math.round(bounds[2] * 1e7), true); // max lon
  view.setInt32(109, Math.round(bounds[3] * 1e7), true); // max lat

  const centerZoom = Math.round((minZoom + maxZoom) / 2);
  out[113] = centerZoom;
  view.setInt32(114, Math.round(((bounds[0] + bounds[2]) / 2) * 1e7), true);
  view.setInt32(118, Math.round(((bounds[1] + bounds[3]) / 2) * 1e7), true);

  // Data sections
  out.set(rootDir,      rootDirOffset);
  out.set(metadataBytes, metadataOffset);
  out.set(leafDirs,     leafDirsOffset);
  out.set(tileData,     tileDataOffset);

  return out;
}
