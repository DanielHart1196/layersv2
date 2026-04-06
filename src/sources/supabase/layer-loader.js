import { supabase } from "../../lib/supabase.js";

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
