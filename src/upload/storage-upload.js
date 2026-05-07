import { Upload, isSupported as isTusSupported } from "tus-js-client";
import { supabaseAnonKey, supabaseUrl } from "../lib/supabase.js";

const RESUMABLE_UPLOAD_THRESHOLD_BYTES = 6 * 1024 * 1024;
const TUS_CHUNK_SIZE_BYTES = 6 * 1024 * 1024;

function getByteSize(body) {
  if (!body) return 0;
  if (Number.isFinite(body.size)) return body.size;
  if (Number.isFinite(body.byteLength)) return body.byteLength;
  if (Number.isFinite(body.length)) return body.length;
  return 0;
}

function asBlob(body, contentType) {
  if (body instanceof Blob) return body;
  return new Blob([body], { type: contentType || "application/octet-stream" });
}

function getStorageApiOrigin() {
  if (!supabaseUrl) return "";
  try {
    const url = new URL(supabaseUrl);
    const [projectRef] = url.hostname.split(".");
    if (projectRef && url.hostname.endsWith(".supabase.co") && !url.hostname.includes(".storage.")) {
      url.hostname = `${projectRef}.storage.supabase.co`;
    }
    return url.origin;
  } catch {
    return supabaseUrl.replace(/\/+$/, "");
  }
}

async function getAuthorizationToken(supabase) {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token || supabaseAnonKey;
}

function uploadWithTus({
  endpoint,
  token,
  bucket,
  path,
  body,
  contentType,
  cacheControl,
  onProgress,
}) {
  return new Promise((resolve, reject) => {
    const upload = new Upload(asBlob(body, contentType), {
      endpoint,
      chunkSize: TUS_CHUNK_SIZE_BYTES,
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      retryDelays: [0, 1000, 3000, 5000],
      headers: {
        apikey: supabaseAnonKey,
        authorization: `Bearer ${token}`,
        "x-upsert": "false",
      },
      metadata: {
        bucketName: bucket,
        objectName: path,
        contentType: contentType || "application/octet-stream",
        cacheControl: cacheControl || "3600",
      },
      onError(error) {
        reject(error);
      },
      onProgress(bytesUploaded, bytesTotal) {
        onProgress?.(bytesUploaded, bytesTotal);
      },
      onSuccess() {
        resolve();
      },
    });
    upload.start();
  });
}

export async function uploadStorageObject(supabase, {
  bucket,
  path,
  body,
  contentType,
  cacheControl = "3600",
  resumableThresholdBytes = RESUMABLE_UPLOAD_THRESHOLD_BYTES,
  onProgress,
} = {}) {
  const size = getByteSize(body);
  const shouldUseResumable = size >= resumableThresholdBytes && isTusSupported;

  if (shouldUseResumable) {
    const token = await getAuthorizationToken(supabase);
    if (!token || !supabaseAnonKey) {
      throw new Error("Supabase auth is not configured for resumable uploads.");
    }
    await uploadWithTus({
      endpoint: `${getStorageApiOrigin()}/storage/v1/upload/resumable`,
      token,
      bucket,
      path,
      body,
      contentType,
      cacheControl,
      onProgress,
    });
    return { resumable: true };
  }

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, body, { contentType, cacheControl });

  if (error) {
    throw error;
  }

  onProgress?.(size, size);
  return { resumable: false };
}
