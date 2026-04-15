import Papa from "papaparse";
import { gpx, kml } from "@tmcw/togeojson";
import { detectColumns } from "./csv-mapper.js";

export const SUPPORTED_EXTENSIONS = [".csv", ".xlsx", ".geojson", ".json", ".gpx", ".kml", ".zip"];

export function getFileType(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv"))                      return "csv";
  if (name.endsWith(".xlsx"))                     return "xlsx";
  if (name.endsWith(".gpx"))                      return "gpx";
  if (name.endsWith(".kml"))                      return "kml";
  if (name.endsWith(".zip"))                      return "shapefile-zip";
  if (name.endsWith(".geojson") || name.endsWith(".json")) return "geojson";
  return null;
}

// Returns { type, headers, rows, features, mapping, error }
// For CSV/XLSX: returns headers + rows so the UI can show the column mapper
// For GeoJSON/GPX/KML/shapefile zip: returns features directly, no mapping needed
export async function parseFile(file) {
  const type = getFileType(file);
  if (!type) {
    return { error: `Unsupported file type. Use: ${SUPPORTED_EXTENSIONS.join(", ")}` };
  }

  if (type === "csv") {
    const text = await file.text();
    const result = Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: false });
    if (result.errors.length && result.data.length === 0) {
      return { error: "Could not parse CSV." };
    }
    const headers = result.meta.fields ?? [];
    const rows = result.data;
    const mapping = detectColumns(headers);
    return { type: "csv", headers, rows, mapping };
  }

  if (type === "xlsx") {
    const { read: xlsxRead, utils: xlsxUtils } = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const workbook = xlsxRead(buffer, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return { error: "No sheets found in this workbook." };
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsxUtils.sheet_to_json(sheet, { defval: "" });
    if (rows.length === 0) return { error: "Sheet is empty." };
    const headers = Object.keys(rows[0]);
    // Normalise all values to strings to match CSV behaviour
    const stringRows = rows.map((r) => Object.fromEntries(headers.map((h) => [h, r[h] == null ? "" : String(r[h])])));
    const mapping = detectColumns(headers);
    return { type: "csv", headers, rows: stringRows, mapping }; // reuse csv flow
  }

  if (type === "gpx") {
    const text = await file.text();
    const xml = new DOMParser().parseFromString(text, "text/xml");
    const geojson = gpx(xml);
    return { type: "gpx", features: normaliseFeatures(geojson.features) };
  }

  if (type === "kml") {
    const text = await file.text();
    const xml = new DOMParser().parseFromString(text, "text/xml");
    const geojson = kml(xml);
    return { type: "kml", features: normaliseFeatures(geojson.features) };
  }

  if (type === "shapefile-zip") {
    const { default: shp } = await import("shpjs");
    const buffer = await file.arrayBuffer();
    const geojson = await shp(buffer);
    const features = Array.isArray(geojson)
      ? geojson.flatMap((collection) => collection?.features ?? [])
      : geojson?.features ?? [];
    return { type: "shapefile-zip", features: normaliseFeatures(features) };
  }

  if (type === "geojson") {
    const text = await file.text();
    const geojson = JSON.parse(text);
    const features = geojson.type === "FeatureCollection"
      ? geojson.features
      : geojson.type === "Feature" ? [geojson] : [];
    return { type: "geojson", features: normaliseFeatures(features) };
  }
}

function sanitizePosition(value) {
  return Array.isArray(value)
    && value.length >= 2
    && Number.isFinite(value[0])
    && Number.isFinite(value[1]);
}

function sanitizeLineStringCoordinates(value) {
  if (!Array.isArray(value)) return null;
  const coords = value.filter(sanitizePosition);
  return coords.length >= 2 ? coords : null;
}

function sanitizePolygonCoordinates(value) {
  if (!Array.isArray(value)) return null;
  const rings = value
    .map((ring) => sanitizeLineStringCoordinates(ring))
    .filter(Boolean);
  return rings.length ? rings : null;
}

function sanitizeGeometry(geometry) {
  if (!geometry || typeof geometry !== "object" || !geometry.type) {
    return null;
  }

  switch (geometry.type) {
    case "Point":
      return sanitizePosition(geometry.coordinates)
        ? { type: "Point", coordinates: geometry.coordinates }
        : null;
    case "MultiPoint": {
      const coordinates = Array.isArray(geometry.coordinates)
        ? geometry.coordinates.filter(sanitizePosition)
        : null;
      return coordinates?.length ? { type: "MultiPoint", coordinates } : null;
    }
    case "LineString": {
      const coordinates = sanitizeLineStringCoordinates(geometry.coordinates);
      return coordinates ? { type: "LineString", coordinates } : null;
    }
    case "MultiLineString": {
      const coordinates = Array.isArray(geometry.coordinates)
        ? geometry.coordinates.map((line) => sanitizeLineStringCoordinates(line)).filter(Boolean)
        : null;
      return coordinates?.length ? { type: "MultiLineString", coordinates } : null;
    }
    case "Polygon": {
      const coordinates = sanitizePolygonCoordinates(geometry.coordinates);
      return coordinates ? { type: "Polygon", coordinates } : null;
    }
    case "MultiPolygon": {
      const coordinates = Array.isArray(geometry.coordinates)
        ? geometry.coordinates.map((polygon) => sanitizePolygonCoordinates(polygon)).filter(Boolean)
        : null;
      return coordinates?.length ? { type: "MultiPolygon", coordinates } : null;
    }
    case "GeometryCollection": {
      const geometries = Array.isArray(geometry.geometries)
        ? geometry.geometries.map(sanitizeGeometry).filter(Boolean)
        : null;
      return geometries?.length ? { type: "GeometryCollection", geometries } : null;
    }
    default:
      return null;
  }
}

// Ensure every feature has a proper properties object and pull out time fields
function normaliseFeatures(features) {
  return features
    .map((f) => {
      const geometry = sanitizeGeometry(f?.geometry);
      if (!geometry) {
        return null;
      }
      return {
        type: "Feature",
        geometry,
        properties: f.properties ?? {},
        valid_from: f.properties?.valid_from ?? f.properties?.time ?? f.properties?.start ?? null,
        valid_to:   f.properties?.valid_to   ?? f.properties?.end  ?? null,
      };
    })
    .filter(Boolean);
}
