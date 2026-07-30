import Papa from "papaparse";
import { gpx, kml } from "@tmcw/togeojson";
import { detectColumns } from "./csv-mapper.js";
import { inspectPmtilesFile } from "./pmtiles-metadata.js";

export const SUPPORTED_EXTENSIONS = [".csv", ".xlsx", ".geojson", ".json", ".gpx", ".kml", ".zip", ".pmtiles"];

export function getFileType(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv"))                      return "csv";
  if (name.endsWith(".xlsx"))                     return "xlsx";
  if (name.endsWith(".gpx"))                      return "gpx";
  if (name.endsWith(".kml"))                      return "kml";
  if (name.endsWith(".zip"))                      return "shapefile-zip";
  if (name.endsWith(".pmtiles"))                  return "pmtiles";
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
    return { type: "gpx", features: normaliseGpxFeatures(geojson.features) };
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

  if (type === "pmtiles") {
    const pmtiles = await inspectPmtilesFile(file);
    return { type: "pmtiles", features: [], pmtiles };
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

function getPositionZ(value) {
  if (!Array.isArray(value) || value.length < 3) {
    return null;
  }
  const z = Number(value[2]);
  return Number.isFinite(z) ? z : null;
}

function sanitizePositionCoordinates(value, zValues) {
  if (!sanitizePosition(value)) {
    return null;
  }
  const z = getPositionZ(value);
  if (z !== null) {
    zValues.push(z);
  }
  return [value[0], value[1]];
}

function sanitizeLineStringCoordinates(value, zValues) {
  if (!Array.isArray(value)) return null;
  const coords = value
    .map((position) => sanitizePositionCoordinates(position, zValues))
    .filter(Boolean);
  return coords.length >= 2 ? coords : null;
}

function sanitizePolygonCoordinates(value, zValues) {
  if (!Array.isArray(value)) return null;
  const rings = value
    .map((ring) => sanitizeLineStringCoordinates(ring, zValues))
    .filter(Boolean);
  return rings.length ? rings : null;
}

function sanitizeGeometry(geometry) {
  if (!geometry || typeof geometry !== "object" || !geometry.type) {
    return null;
  }

  const zValues = [];
  const result = (sanitizedGeometry) => sanitizedGeometry
    ? { geometry: sanitizedGeometry, zValues }
    : null;

  switch (geometry.type) {
    case "Point": {
      const coordinates = sanitizePositionCoordinates(geometry.coordinates, zValues);
      return result(coordinates ? { type: "Point", coordinates } : null);
    }
    case "MultiPoint": {
      const coordinates = Array.isArray(geometry.coordinates)
        ? geometry.coordinates
          .map((position) => sanitizePositionCoordinates(position, zValues))
          .filter(Boolean)
        : null;
      return result(coordinates?.length ? { type: "MultiPoint", coordinates } : null);
    }
    case "LineString": {
      const coordinates = sanitizeLineStringCoordinates(geometry.coordinates, zValues);
      return result(coordinates ? { type: "LineString", coordinates } : null);
    }
    case "MultiLineString": {
      const coordinates = Array.isArray(geometry.coordinates)
        ? geometry.coordinates.map((line) => sanitizeLineStringCoordinates(line, zValues)).filter(Boolean)
        : null;
      return result(coordinates?.length ? { type: "MultiLineString", coordinates } : null);
    }
    case "Polygon": {
      const coordinates = sanitizePolygonCoordinates(geometry.coordinates, zValues);
      return result(coordinates ? { type: "Polygon", coordinates } : null);
    }
    case "MultiPolygon": {
      const coordinates = Array.isArray(geometry.coordinates)
        ? geometry.coordinates.map((polygon) => sanitizePolygonCoordinates(polygon, zValues)).filter(Boolean)
        : null;
      return result(coordinates?.length ? { type: "MultiPolygon", coordinates } : null);
    }
    case "GeometryCollection": {
      const sanitizedChildren = Array.isArray(geometry.geometries)
        ? geometry.geometries.map(sanitizeGeometry).filter(Boolean)
        : null;
      if (!sanitizedChildren?.length) {
        return null;
      }
      sanitizedChildren.forEach((child) => zValues.push(...child.zValues));
      return result({
        type: "GeometryCollection",
        geometries: sanitizedChildren.map((child) => child.geometry),
      });
    }
    default:
      return null;
  }
}

function getAvailablePropertyKey(properties, preferredKey) {
  if (!(preferredKey in properties)) {
    return preferredKey;
  }
  let index = 2;
  let candidate = `${preferredKey}_${index}`;
  while (candidate in properties) {
    index += 1;
    candidate = `${preferredKey}_${index}`;
  }
  return candidate;
}

function addElevationProperties(properties, geometryType, zValues) {
  if (!zValues.length) {
    return properties;
  }
  const nextProperties = { ...properties };
  const min = Math.min(...zValues);
  const max = Math.max(...zValues);
  const mean = zValues.reduce((sum, value) => sum + value, 0) / zValues.length;
  const add = (key, value) => {
    nextProperties[getAvailablePropertyKey(nextProperties, key)] = value;
  };

  if (geometryType === "Point" && zValues.length === 1) {
    add("geometry_z", zValues[0]);
  } else {
    add("geometry_z_min", min);
    add("geometry_z_max", max);
    add("geometry_z_mean", mean);
    add("geometry_z_values", JSON.stringify(zValues));
  }

  return nextProperties;
}

function parseTimestampMs(value) {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function getCoordinateTimes(properties) {
  const candidates = [
    properties?.coordinateProperties?.times,
    properties?.coordTimes,
    properties?.times,
  ];
  const times = candidates.find((candidate) => Array.isArray(candidate));
  return Array.isArray(times) ? times : [];
}

function buildTimedPointFeature(sourceFeature, coordinate, time, index, trackId) {
  const properties = {
    ...(sourceFeature.properties ?? {}),
    _replay_kind: "track-point",
    _replay_index: index,
    _replay_track_id: trackId,
  };
  delete properties.coordinateProperties;
  const validFromMs = parseTimestampMs(time);
  if (validFromMs !== null) {
    properties._valid_from_ms = validFromMs;
  }
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: coordinate },
    properties,
    valid_from: time ?? null,
    valid_to: null,
  };
}

function buildTimedSegmentFeature(sourceFeature, coordinates, time, index, trackId) {
  const properties = {
    ...(sourceFeature.properties ?? {}),
    _replay_kind: "track-segment",
    _replay_index: index,
    _replay_track_id: trackId,
  };
  delete properties.coordinateProperties;
  const validFromMs = parseTimestampMs(time);
  if (validFromMs !== null) {
    properties._valid_from_ms = validFromMs;
  }
  return {
    type: "Feature",
    geometry: { type: "LineString", coordinates },
    properties,
    valid_from: time ?? null,
    valid_to: null,
  };
}

function expandTimedLineStringFeature(feature, featureIndex) {
  const coordinates = feature?.geometry?.coordinates;
  const times = getCoordinateTimes(feature?.properties ?? {});
  if (!Array.isArray(coordinates) || coordinates.length < 2 || times.length < coordinates.length) {
    return [feature];
  }

  const sanitizedCoordinates = coordinates
    .map((position) => Array.isArray(position) && position.length >= 2 ? [position[0], position[1]] : null);
  if (sanitizedCoordinates.some((position) => !position)) {
    return [feature];
  }

  const trackId = String(feature?.properties?.name ?? feature?.properties?.desc ?? `gpx-track-${featureIndex}`);
  const points = sanitizedCoordinates.map((coordinate, index) => (
    buildTimedPointFeature(feature, coordinate, times[index], index, trackId)
  ));
  const segments = [];
  for (let index = 1; index < sanitizedCoordinates.length; index += 1) {
    segments.push(buildTimedSegmentFeature(
      feature,
      [sanitizedCoordinates[index - 1], sanitizedCoordinates[index]],
      times[index],
      index,
      trackId,
    ));
  }
  return [...segments, ...points];
}

function expandTimedGpxFeature(feature, featureIndex) {
  if (feature?.geometry?.type === "LineString") {
    return expandTimedLineStringFeature(feature, featureIndex);
  }
  if (feature?.geometry?.type === "MultiLineString") {
    const multiTimes = getCoordinateTimes(feature?.properties ?? {});
    return feature.geometry.coordinates.flatMap((coordinates, lineIndex) => {
      const lineFeature = {
        ...feature,
        geometry: { type: "LineString", coordinates },
        properties: {
          ...(feature.properties ?? {}),
          coordinateProperties: {
            times: Array.isArray(multiTimes[lineIndex]) ? multiTimes[lineIndex] : [],
          },
        },
      };
      return expandTimedLineStringFeature(lineFeature, `${featureIndex}-${lineIndex}`);
    });
  }
  return [feature];
}

function normaliseGpxFeatures(features) {
  return normaliseFeatures(
    features.flatMap((feature, index) => expandTimedGpxFeature(feature, index)),
  );
}

// Ensure every feature has a proper properties object and pull out time fields
function normaliseFeatures(features) {
  return features
    .map((f) => {
      const sanitized = sanitizeGeometry(f?.geometry);
      if (!sanitized) {
        return null;
      }
      const properties = addElevationProperties(
        f.properties ?? {},
        sanitized.geometry.type,
        sanitized.zValues,
      );
      const validFrom = f.valid_from ?? f.properties?.valid_from ?? f.properties?.time ?? f.properties?.start ?? null;
      const validTo = f.valid_to ?? f.properties?.valid_to ?? f.properties?.end ?? null;
      const validFromMs = parseTimestampMs(validFrom);
      const nextProperties = { ...properties };
      if (validFrom) {
        nextProperties._valid_from = validFrom;
      }
      if (validTo) {
        nextProperties._valid_to = validTo;
      }
      if (validFromMs !== null && nextProperties._valid_from_ms === undefined) {
        nextProperties._valid_from_ms = validFromMs;
      }
      return {
        type: "Feature",
        geometry: sanitized.geometry,
        properties: nextProperties,
        valid_from: validFrom,
        valid_to: validTo,
      };
    })
    .filter(Boolean);
}
