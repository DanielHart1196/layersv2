const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);
const localAdminApi = String(import.meta.env.VITE_LOCAL_ADMIN_API ?? "").trim().replace(/\/+$/, "");

function isLocalHostname(hostname = window.location.hostname) {
  return LOCAL_HOSTNAMES.has(hostname) || /^192\.168\./.test(hostname) || /^10\./.test(hostname);
}

function isLocalAdminEnabled() {
  return Boolean(localAdminApi) && isLocalHostname();
}

function getLocalAdminApi() {
  return localAdminApi;
}

async function parseAdminResponse(response) {
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(payload?.error ?? `Local admin request failed with ${response.status}.`);
  }
  return payload;
}

async function localAdminJson(path, { method = "POST", body = null } = {}) {
  if (!isLocalAdminEnabled()) {
    throw new Error("Local admin API is not enabled.");
  }
  const response = await fetch(`${localAdminApi}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
    },
    body: body == null ? null : JSON.stringify(body),
  });
  return parseAdminResponse(response);
}

async function localAdminUpload({ bucket, path, body, contentType, cacheControl, onProgress }) {
  if (!isLocalAdminEnabled()) {
    throw new Error("Local admin API is not enabled.");
  }
  const response = await fetch(`${localAdminApi}/admin/storage/${encodeURIComponent(bucket)}/upload?path=${encodeURIComponent(path)}`, {
    method: "PUT",
    headers: {
      "content-type": contentType || "application/octet-stream",
      ...(cacheControl ? { "cache-control": String(cacheControl) } : {}),
    },
    body,
  });
  const payload = await parseAdminResponse(response);
  const size = Number(body?.size ?? body?.byteLength ?? body?.length ?? 0);
  onProgress?.(size, size);
  return payload;
}

export {
  getLocalAdminApi,
  isLocalAdminEnabled,
  localAdminJson,
  localAdminUpload,
};
