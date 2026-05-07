import { FileSource, PMTiles, TileType } from "pmtiles";

function normalizeVectorLayers(value) {
  if (typeof value === "string") {
    try {
      return normalizeVectorLayers(JSON.parse(value));
    } catch {
      return [];
    }
  }
  return Array.isArray(value) ? value.filter((layer) => layer && typeof layer === "object") : [];
}

function normalizeTilestatsLayers(value) {
  return Array.isArray(value)
    ? value
      .filter((layer) => layer && typeof layer === "object")
      .map((layer) => ({
        ...layer,
        id: layer.id ?? layer.layer,
        geometry_type: layer.geometry_type ?? layer.geometry,
      }))
    : [];
}

function normalizeGeometryFamily(value) {
  const normalized = String(value ?? "").toLowerCase();
  if (normalized.includes("point")) return "point";
  if (normalized.includes("line")) return "line";
  if (normalized.includes("polygon") || normalized.includes("area")) return "polygon";
  return null;
}

function inferGeometryTypesFromVectorLayers(vectorLayers = []) {
  const families = new Set();
  vectorLayers.forEach((layer) => {
    const geometryType = layer.geometry_type ?? layer.geometryType ?? layer.geometry ?? layer.type;
    const family = normalizeGeometryFamily(geometryType);
    if (family) families.add(family);
  });
  return ["point", "line", "polygon"].filter((family) => families.has(family));
}

function collapseGeometryTypes(geometryTypes = []) {
  if (geometryTypes.length === 1) return geometryTypes[0];
  return "mixed";
}

function humanizeFieldLabel(key) {
  return String(key ?? "")
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function normalizeFieldType(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (
    normalized.includes("number")
    || normalized.includes("numeric")
    || normalized.includes("integer")
    || normalized.includes("float")
    || normalized.includes("double")
    || normalized === "int"
    || normalized === "uint"
  ) {
    return "number";
  }
  if (normalized.includes("bool")) return "boolean";
  if (normalized.includes("date") || normalized.includes("time")) return "date";
  return "text";
}

function getLayerFieldEntries(layer) {
  const entries = [];

  if (layer?.fields && typeof layer.fields === "object" && !Array.isArray(layer.fields)) {
    Object.entries(layer.fields).forEach(([key, type]) => {
      entries.push({ key, type });
    });
  }

  const attributes = Array.isArray(layer?.attributes) ? layer.attributes : [];
  attributes.forEach((attribute) => {
    const key = attribute?.attribute ?? attribute?.name ?? attribute?.key ?? attribute?.id;
    if (!key) return;
    entries.push({
      key,
      type: attribute?.type ?? attribute?.value_type ?? attribute?.values?.[0]?.type,
    });
  });

  return entries;
}

function buildFieldSchema(layer) {
  const seen = new Set();
  return getLayerFieldEntries(layer)
    .map((field) => ({
      key: String(field.key ?? "").trim(),
      type: normalizeFieldType(field.type),
    }))
    .filter((field) => {
      if (!field.key || seen.has(field.key)) return false;
      seen.add(field.key);
      return true;
    })
    .map((field) => ({
      key: field.key,
      label: humanizeFieldLabel(field.key),
      type: field.type,
      required: false,
      visible: true,
      sortable: true,
      filterable: true,
    }));
}

export async function inspectPmtilesFile(file) {
  const archive = new PMTiles(new FileSource(file));
  const [header, metadata] = await Promise.all([
    archive.getHeader(),
    archive.getMetadata(),
  ]);

  if (header.tileType !== TileType.Mvt) {
    throw new Error("Only vector PMTiles uploads are supported.");
  }

  const vectorLayers = normalizeVectorLayers(metadata?.vector_layers);
  const tilestatsLayers = normalizeTilestatsLayers(metadata?.tilestats?.layers);
  const tilestatsById = new Map(tilestatsLayers.map((layer) => [layer.id, layer]));
  const metadataLayers = vectorLayers.length
    ? vectorLayers.map((layer) => ({
      ...tilestatsById.get(layer.id),
      ...layer,
      geometry_type: layer.geometry_type ?? layer.geometry ?? tilestatsById.get(layer.id)?.geometry_type,
    }))
    : tilestatsLayers;
  const sourceLayer = String(metadataLayers[0]?.id ?? "").trim();
  if (!sourceLayer) {
    throw new Error("PMTiles metadata does not include a vector layer name.");
  }

  const geometryTypes = inferGeometryTypesFromVectorLayers(metadataLayers);
  if (!geometryTypes.length) {
    throw new Error("PMTiles metadata does not include a supported geometry type.");
  }
  const sourceMetadataLayer = metadataLayers.find((layer) => layer.id === sourceLayer) ?? metadataLayers[0];
  const fieldSchema = buildFieldSchema(sourceMetadataLayer);

  return {
    sourceLayer,
    geometryTypes,
    geometryType: collapseGeometryTypes(geometryTypes),
    minzoom: header.minZoom,
    maxzoom: header.maxZoom,
    bounds: [header.minLon, header.minLat, header.maxLon, header.maxLat],
    fieldSchema,
    metadata: {
      name: metadata?.name ?? null,
      description: metadata?.description ?? null,
      attribution: metadata?.attribution ?? null,
      vector_layers: metadataLayers,
      field_schema: fieldSchema,
      addressed_tiles: header.numAddressedTiles,
      tile_entries: header.numTileEntries,
      tile_contents: header.numTileContents,
    },
  };
}
