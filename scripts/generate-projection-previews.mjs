import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { geoPath } from "d3-geo";
import {
  PROJECTIONS,
  createProjectionAdapter,
  createProjectionAdapterState,
  normalizeProjectionCamera,
} from "../src/print/projection-adapters.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const outputDir = path.join(rootDir, "public", "projection-previews");
const landPath = path.join(rootDir, "public", "data", "world-atlas", "land-110m.geojson");
const graticulesPath = path.join(rootDir, "public", "data", "graticules", "world-graticules-10deg.geojson");
const width = 384;
const height = 240;
const PREVIEW_CAMERA_OVERRIDES = Object.freeze({
  peirceQuincuncial: {
    locked: true,
  },
});

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function compactPathData(value) {
  return String(value ?? "")
    .replace(/-?\d+\.\d+/g, (match) => {
      const rounded = Number(match).toFixed(1);
      return rounded.replace(/\.0$/, "");
    })
    .replace(/\s+/g, " ");
}

function buildPreviewSvg({ projectionId, projectionName, land, graticules }) {
  const previewConfig = PREVIEW_CAMERA_OVERRIDES[projectionId] ?? {};
  const locked = previewConfig.locked ?? false;
  const camera = {
    ...normalizeProjectionCamera(projectionId, null, { locked }),
    projectionZoomScale: 0.88,
    zoomScale: 0.88,
  };
  const adapter = createProjectionAdapter({
    projectionType: projectionId,
    width,
    height,
    camera,
    locked,
    state: createProjectionAdapterState(),
    renderQuality: "interactive",
  });
  const pathGenerator = geoPath(adapter.projection);
  const sphere = compactPathData(pathGenerator({ type: "Sphere" }));
  const landD = compactPathData(pathGenerator(land));
  const graticulesD = compactPathData(pathGenerator(graticules));
  const clipId = `clip-${projectionId}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(projectionName)} projection preview">
  <defs>
    <clipPath id="${escapeXml(clipId)}">
      <path d="${escapeXml(sphere)}"/>
    </clipPath>
  </defs>
  <path d="${escapeXml(sphere)}" fill="#d9eef7"/>
  <g clip-path="url(#${escapeXml(clipId)})">
    <path d="${escapeXml(graticulesD)}" fill="none" stroke="#8fa9bc" stroke-opacity="0.6" stroke-width="2"/>
    <path d="${escapeXml(landD)}" fill="#6eaa6e" stroke="#2f5638" stroke-opacity="0.8" stroke-width="2"/>
  </g>
</svg>
`;
}

await fs.mkdir(outputDir, { recursive: true });
const [land, graticules] = await Promise.all([
  fs.readFile(landPath, "utf8").then(JSON.parse),
  fs.readFile(graticulesPath, "utf8").then(JSON.parse),
]);

for (const { id, name } of PROJECTIONS) {
  if (id === "custom") {
    continue;
  }
  const svg = buildPreviewSvg({ projectionId: id, projectionName: name, land, graticules });
  await fs.writeFile(path.join(outputDir, `${id}.svg`), svg);
}
