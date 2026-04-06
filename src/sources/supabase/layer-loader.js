import { supabase } from "../../lib/supabase.js";

// Merges a partial style patch into the layer's default_style in Supabase.
// key/value pairs map directly to default_style fields (color, opacity, radius, weight).
export async function updateLayerDefaultStyle(layerId, patch) {
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
  const { data, error } = await supabase
    .from("layers")
    .select("id, name, geometry_type")
    .in("view_access", ["public", "unlisted"])
    .order("name");

  if (error || !data?.length) return [];

  return data.map((l) => ({
    id: l.id,
    label: l.name,
    group: "My layers",
    geometryType: l.geometry_type ?? "mixed",
  }));
}

// Returns sorted distinct values for a specific property field, sampled from up to 200 features.
export async function getLayerFieldValues(layerId, field) {
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

const MAX_GEOJSON_FEATURES = 10_000;

export async function loadLayerFromSupabase(layerId) {
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
