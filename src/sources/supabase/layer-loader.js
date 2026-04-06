import { supabase } from "../../lib/supabase.js";

export async function loadLayerFromSupabase(layerId) {
  const [layerResult, geojsonResult] = await Promise.all([
    supabase.from("layers").select("name, geometry_type, default_style, tiles_url").eq("id", layerId).single(),
    supabase.rpc("get_layer_geojson", { p_layer_id: layerId }),
  ]);

  if (layerResult.error) throw new Error(`Failed to load layer: ${layerResult.error.message}`);
  if (geojsonResult.error) throw new Error(`Failed to load features: ${geojsonResult.error.message}`);

  return {
    layer: layerResult.data,
    geojson: geojsonResult.data,
  };
}
