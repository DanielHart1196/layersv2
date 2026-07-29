import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const projectRoot = resolve(import.meta.dirname, "..");
const env = await loadEnvFile(resolve(projectRoot, ".env.local"));
const supabaseUrl = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
const port = Number(env.LOCAL_ADMIN_PORT || 8101);
const maxBodyBytes = Number(env.LOCAL_ADMIN_MAX_BODY_BYTES || 250 * 1024 * 1024);

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local before running the local admin server.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

function parseEnvValue(value) {
  const trimmed = String(value ?? "").trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

async function loadEnvFile(path) {
  const result = {};
  const raw = await readFile(path, "utf8");
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) return;
    result[trimmed.slice(0, eq).trim()] = parseEnvValue(trimmed.slice(eq + 1));
  });
  return result;
}

function sendJson(response, status, payload = {}) {
  response.writeHead(status, {
    "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type,cache-control",
    "content-type": "application/json",
  });
  response.end(JSON.stringify(payload));
}

function isAllowedOrigin(origin) {
  if (!origin) return true;
  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost"
      || hostname === "127.0.0.1"
      || hostname === "::1"
      || /^192\.168\./.test(hostname)
      || /^10\./.test(hostname);
  } catch {
    return false;
  }
}

function sendError(response, status, message) {
  sendJson(response, status, { error: message });
}

async function readBody(request) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.byteLength;
    if (total > maxBodyBytes) {
      throw new Error(`Request body exceeds ${maxBodyBytes} bytes.`);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(request) {
  const body = await readBody(request);
  if (!body.length) return {};
  return JSON.parse(body.toString("utf8"));
}

async function requireSingle(query, label) {
  const { data, error } = await query;
  if (error) {
    throw new Error(`${label}: ${error.message}`);
  }
  return data;
}

async function requireOk(query, label) {
  const { data, error } = await query;
  if (error) {
    throw new Error(`${label}: ${error.message}`);
  }
  return data;
}

async function handleAdminRequest(request, response) {
  if (request.method === "OPTIONS") {
    sendJson(response, 204);
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host}`);
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] !== "admin") {
    sendError(response, 404, "Not found.");
    return;
  }

  if (parts[1] === "health" && request.method === "GET") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (parts[1] === "layers" && request.method === "POST" && parts.length === 2) {
    const body = await readJson(request);
    const data = await requireSingle(
      supabase.from("layers").insert(body).select("id").single(),
      "Failed to create layer",
    );
    sendJson(response, 200, { data });
    return;
  }

  if (parts[1] === "layers" && parts[2] && request.method === "PATCH") {
    const body = await readJson(request);
    const data = await requireSingle(
      supabase.from("layers").update(body).eq("id", parts[2]).select("*").single(),
      "Failed to update layer",
    );
    sendJson(response, 200, { data });
    return;
  }

  if (parts[1] === "layers" && parts[2] && request.method === "DELETE") {
    const data = await requireSingle(
      supabase.from("layers").delete().eq("id", parts[2]).select("id").single(),
      "Failed to delete layer",
    );
    sendJson(response, 200, { data });
    return;
  }

  if (parts[1] === "datasets" && request.method === "POST" && parts.length === 2) {
    const body = await readJson(request);
    const data = await requireSingle(
      supabase.from("datasets").insert(body).select("id").single(),
      "Failed to create dataset",
    );
    sendJson(response, 200, { data });
    return;
  }

  if (parts[1] === "datasets" && parts[2] && request.method === "PATCH") {
    const body = await readJson(request);
    let query = supabase.from("datasets").update(body.patch ?? body);
    if (body.filter?.layer_id) {
      query = query.eq("layer_id", body.filter.layer_id);
    } else {
      query = query.eq("id", parts[2]);
    }
    const data = await requireOk(query.select("*"), "Failed to update dataset");
    sendJson(response, 200, { data });
    return;
  }

  if (parts[1] === "datasets" && parts[2] && request.method === "DELETE") {
    const data = await requireSingle(
      supabase.from("datasets").delete().eq("id", parts[2]).select("id").single(),
      "Failed to delete dataset",
    );
    sendJson(response, 200, { data });
    return;
  }

  if (parts[1] === "features" && parts[2] === "batch" && request.method === "POST") {
    const body = await readJson(request);
    const rows = Array.isArray(body.rows) ? body.rows : [];
    await requireOk(supabase.from("features").insert(rows), "Failed to insert features");
    sendJson(response, 200, { inserted: rows.length });
    return;
  }

  if (parts[1] === "storage" && parts[2] && parts[3] === "upload" && request.method === "PUT") {
    const bucket = decodeURIComponent(parts[2]);
    const path = url.searchParams.get("path") ?? "";
    if (!path) {
      sendError(response, 400, "Missing storage path.");
      return;
    }
    const body = await readBody(request);
    await requireOk(
      supabase.storage.from(bucket).upload(path, body, {
        contentType: request.headers["content-type"] || "application/octet-stream",
        cacheControl: request.headers["cache-control"] || "3600",
        upsert: false,
      }),
      "Failed to upload storage object",
    );
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    sendJson(response, 200, { data });
    return;
  }

  sendError(response, 404, "Unknown admin endpoint.");
}

createServer((request, response) => {
  const origin = request.headers.origin;
  if (!isAllowedOrigin(origin)) {
    sendError(response, 403, "Origin is not allowed for the local admin server.");
    return;
  }
  if (origin) {
    response.setHeader("access-control-allow-origin", origin);
    response.setHeader("vary", "origin");
  }
  handleAdminRequest(request, response).catch((error) => {
    sendError(response, 500, error?.message ?? "Local admin request failed.");
  });
}).listen(port, "127.0.0.1", () => {
  console.log(`Local Layers admin server listening on http://127.0.0.1:${port}`);
});
