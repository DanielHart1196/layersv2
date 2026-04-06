import Papa from "papaparse";
import { gpx, kml } from "@tmcw/togeojson";
import { detectColumns, rowsToFeatures } from "./csv-mapper.js";

export const SUPPORTED_EXTENSIONS = [".csv", ".geojson", ".json", ".gpx"];

export function getFileType(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv"))                      return "csv";
  if (name.endsWith(".gpx"))                      return "gpx";
  if (name.endsWith(".geojson") || name.endsWith(".json")) return "geojson";
  return null;
}

// Returns { type, headers, rows, features, mapping, error }
// For CSV: returns headers + rows so the UI can show the column mapper
// For GeoJSON/GPX: returns features directly, no mapping needed
export async function parseFile(file) {
  const type = getFileType(file);
  if (!type) {
    return { error: `Unsupported file type. Use: ${SUPPORTED_EXTENSIONS.join(", ")}` };
  }

  const text = await file.text();

  if (type === "csv") {
    const result = Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: false });
    if (result.errors.length && result.data.length === 0) {
      return { error: "Could not parse CSV." };
    }
    const headers = result.meta.fields ?? [];
    const rows = result.data;
    const mapping = detectColumns(headers);
    return { type: "csv", headers, rows, mapping };
  }

  if (type === "gpx") {
    const xml = new DOMParser().parseFromString(text, "text/xml");
    const geojson = gpx(xml);
    return { type: "gpx", features: normaliseFeatures(geojson.features) };
  }

  if (type === "geojson") {
    const geojson = JSON.parse(text);
    const features = geojson.type === "FeatureCollection"
      ? geojson.features
      : geojson.type === "Feature" ? [geojson] : [];
    return { type: "geojson", features: normaliseFeatures(features) };
  }
}

// Ensure every feature has a proper properties object and pull out time fields
function normaliseFeatures(features) {
  return features.map((f) => ({
    type: "Feature",
    geometry: f.geometry,
    properties: f.properties ?? {},
    valid_from: f.properties?.valid_from ?? f.properties?.time ?? f.properties?.start ?? null,
    valid_to:   f.properties?.valid_to   ?? f.properties?.end  ?? null,
  }));
}
