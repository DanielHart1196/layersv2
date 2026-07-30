import { requireSupabase } from "../../lib/supabase.js";

async function createMapShare(snapshot) {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("map_shares")
    .insert({
      title: String(snapshot?.meta?.title ?? ""),
      snapshot,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to create share: ${error.message}`);
  }

  return {
    id: data.id,
  };
}

async function loadMapShare(shareId) {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("map_shares")
    .select("id, title, snapshot, created_at")
    .eq("id", shareId)
    .single();

  if (error) {
    throw new Error(`Failed to load share: ${error.message}`);
  }

  return data;
}

async function loadPublicSlug(slug) {
  const normalizedSlug = String(slug ?? "").trim().toLowerCase();
  if (!normalizedSlug) {
    return null;
  }
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("public_view_slugs")
    .select("slug, map_share_id, status")
    .eq("slug", normalizedSlug)
    .eq("status", "active")
    .single();

  if (error) {
    throw new Error(`Failed to load public slug: ${error.message}`);
  }

  return data;
}

export { createMapShare, loadMapShare, loadPublicSlug };
