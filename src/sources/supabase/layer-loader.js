import { requireSupabase } from "../../lib/supabase.js";

// Merges a partial style patch into the layer's default_style in Supabase.
// key/value pairs map directly to default_style fields (color, opacity, radius, weight).
export async function updateLayerDefaultStyle(layerId, patch) {
  const supabase = requireSupabase();
  // Read current default_style first, then merge.
  const { data: layer, error: readError } = await supabase
    .from("layers")
    .select("default_style")
    .eq("id", layerId)
    .single();

  if (readError) throw new Error(readError.message);

  const merged = { ...(layer.default_style ?? {}), ...patch };

  const { error } = await supabase
    .from("layers")
    .update({ default_style: merged })
    .eq("id", layerId);

  if (error) throw new Error(error.message);
}

// Returns all public/unlisted layers from Supabase as catalog entries.
export async function getSupabaseCatalog() {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("layers")
    .select("id, name, geometry_type")
    .in("view_access", ["public", "unlisted"])
    .order("name");

  if (error || !data?.length) return [];

  return data.map((l) => ({
    id: l.id,
    label: l.name,
    group: "Uploaded layers",
    geometryType: l.geometry_type ?? "mixed",
  }));
}

// Returns sorted distinct values for a specific property field, sampled from up to 200 features.
export async function getLayerFieldValues(layerId, field) {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("features")
    .select("properties")
    .eq("layer_id", layerId)
    .limit(200);

  if (error || !data?.length) return null;

  const seen = new Set();
  for (const row of data) {
    const val = row.properties?.[field];
    if (val !== undefined && val !== null && val !== "") seen.add(val);
  }

  if (!seen.size) return null;

  return [...seen].sort((a, b) => {
    if (typeof a === "number" && typeof b === "number") return a - b;
    return String(a).localeCompare(String(b));
  });
}

// Returns sorted unique property field names for a layer, sampled from up to 20 features.
export async function getLayerFields(layerId) {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("features")
    .select("properties")
    .eq("layer_id", layerId)
    .limit(20);

  if (error || !data?.length) return null;

  const keys = new Set();
  for (const row of data) {
    if (row.properties && typeof row.properties === "object") {
      Object.keys(row.properties).forEach((k) => keys.add(k));
    }
  }

  return [...keys].filter((k) => !k.startsWith("_")).sort();
}

export async function getLayerTablePreview(layerId, { limit = 50, offset = 0 } = {}) {
  const supabase = requireSupabase();
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
  const safeOffset = Math.max(0, Number(offset) || 0);
  let layer = null;
  let layerError = null;
  const layerResult = await supabase
    .from("layers")
    .select("field_schema")
    .eq("id", layerId)
    .single();
  layer = layerResult.data;
  layerError = layerResult.error;

  if (layerError && !/field_schema/i.test(layerError.message ?? "")) {
    throw new Error(layerError.message);
  }

  const { data, error } = await supabase
    .from("features")
    .select("id, properties, valid_from, valid_to")
    .eq("layer_id", layerId)
    .range(safeOffset, safeOffset + safeLimit - 1);

  if (error) throw new Error(error.message);

  const rows = Array.isArray(data) ? data : [];
  const schemaFields = Array.isArray(layer?.field_schema) ? layer.field_schema.filter((field) => field?.key) : [];
  const fields = [];
  const seenKeys = new Set();

  fields.push({ key: "id", label: "ID", type: "uuid", source: "column" });
  seenKeys.add("id");

  for (const field of schemaFields) {
    const key = String(field.key);
    if (seenKeys.has(key) || field.visible === false) {
      continue;
    }
    fields.push({
      key,
      label: field.label ?? key,
      type: field.type ?? "text",
      source: "property",
    });
    seenKeys.add(key);
  }

  let hasTemporalData = false;

  for (const row of rows) {
    if (row?.valid_from || row?.valid_to) {
      hasTemporalData = true;
    }
    if (row?.properties && typeof row.properties === "object") {
      Object.keys(row.properties).forEach((key) => {
        if (!String(key).startsWith("_") && !seenKeys.has(key)) {
          fields.push({
            key,
            label: key,
            type: "text",
            source: "property",
          });
          seenKeys.add(key);
        }
      });
    }
  }

  if (hasTemporalData) {
    fields.push({ key: "valid_from", label: "Valid From", type: "date", source: "column" });
    fields.push({ key: "valid_to", label: "Valid To", type: "date", source: "column" });
  }

  return {
    offset: safeOffset,
    limit: safeLimit,
    rows,
    fields,
    hasMore: rows.length === safeLimit,
  };
}

const MAX_GEOJSON_FEATURES = 10_000;

export async function loadLayerFromSupabase(layerId) {
  const supabase = requireSupabase();
  const { data: layer, error: layerError } = await supabase
    .from("layers")
    .select("name, geometry_type, default_style, tiles_url, feature_count")
    .eq("id", layerId)
    .single();

  if (layerError) throw new Error(`Failed to load layer: ${layerError.message}`);

  // PMTiles available — use directly, no GeoJSON needed.
  if (layer.tiles_url) {
    return { layer, geojson: null };
  }

  // Too many features to fetch as flat GeoJSON — skip map load.
  if ((layer.feature_count ?? 0) > MAX_GEOJSON_FEATURES) {
    console.warn(`Layer has ${layer.feature_count} features — too large to load as GeoJSON. Re-upload with tile generation enabled.`);
    return { layer, geojson: null };
  }

  const { data: geojson, error: geojsonError } = await supabase.rpc("get_layer_geojson", { p_layer_id: layerId });
  if (geojsonError) throw new Error(`Failed to load features: ${geojsonError.message}`);

  return { layer, geojson };
}
