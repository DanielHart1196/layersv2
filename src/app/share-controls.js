import { createMapShare, loadMapShare } from "../sources/supabase/map-share-loader.js";

const SHARE_QUERY_KEY = "share";
const SHARE_SNAPSHOT_VERSION = 1;

function getShareIdFromLocation() {
  return new URLSearchParams(window.location.search).get(SHARE_QUERY_KEY) ?? "";
}

function normalizeSharedView(view) {
  if (!view || typeof view !== "object") {
    return null;
  }

  const longitude = Number(view.center?.longitude);
  const latitude = Number(view.center?.latitude);
  const zoom = Number(view.zoom);
  const bearing = Number(view.bearing);
  const pitch = Number(view.pitch);
  if (![longitude, latitude, zoom, bearing, pitch].every(Number.isFinite)) {
    return null;
  }

  return {
    title: typeof view.title === "string" && view.title.trim() ? view.title.trim() : "Layers",
    projectionId: typeof view.projectionId === "string" ? view.projectionId : "globe",
    center: {
      longitude: Math.max(-180, Math.min(180, longitude)),
      latitude: Math.max(-85, Math.min(85, latitude)),
    },
    zoom: Math.max(0, Math.min(24, zoom)),
    bearing,
    pitch: Math.max(0, Math.min(85, pitch)),
  };
}

function normalizeShareSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Number(snapshot.v) !== SHARE_SNAPSHOT_VERSION) {
    return null;
  }
  if (!snapshot.layers || typeof snapshot.layers !== "object") {
    return null;
  }

  const title = String(snapshot.meta?.title ?? "Layers");
  const view = normalizeSharedView(snapshot.view);
  if (view && (!view.title || view.title === "Layers") && title.trim()) {
    view.title = title.trim();
  }

  return {
    v: SHARE_SNAPSHOT_VERSION,
    meta: {
      title,
    },
    view,
    layers: {
      layerState: snapshot.layers.layerState && typeof snapshot.layers.layerState === "object"
        ? structuredClone(snapshot.layers.layerState)
        : null,
      dynamicDefs: snapshot.layers.dynamicDefs && typeof snapshot.layers.dynamicDefs === "object"
        ? structuredClone(snapshot.layers.dynamicDefs)
        : null,
    },
  };
}

async function readShareSnapshotFromLocation() {
  const shareId = getShareIdFromLocation();
  if (!shareId) {
    return null;
  }
  try {
    const share = await loadMapShare(shareId);
    return normalizeShareSnapshot(share.snapshot);
  } catch (error) {
    console.warn("[layers] Failed to load shared map state from Supabase.", error);
    return null;
  }
}

function buildShareSnapshot({ layerModel, screenRuntime, viewModel }) {
  const liveCamera = screenRuntime.getCameraState?.();
  const title = viewModel.getTitle?.() ?? viewModel.getState().title ?? document.title ?? "Layers";
  return {
    v: SHARE_SNAPSHOT_VERSION,
    meta: {
      title,
    },
    view: {
      ...viewModel.getState(),
      ...(liveCamera ?? {}),
    },
    layers: layerModel.getPersistenceSnapshot(),
  };
}

async function createShareUrlFromCurrentState(args) {
  const { id } = await createMapShare(buildShareSnapshot(args));
  const url = new URL(window.location.href);
  url.searchParams.set(SHARE_QUERY_KEY, id);
  url.hash = "";
  return url.toString();
}

async function copyShareUrl(args) {
  const shareUrl = await createShareUrlFromCurrentState(args);
  window.history.replaceState(null, "", shareUrl);
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(shareUrl);
    return shareUrl;
  }
  window.prompt("Copy share URL", shareUrl);
  return shareUrl;
}

function bindShareControls({ getPrintDynamicLayerData = null, layerModel, printRenderer = null, screenRuntime, viewModel }) {
  const printButton = document.getElementById("printModeBtn");
  const shareButton = document.getElementById("shareBtn");
  const sharePopup = document.getElementById("sharePopup");
  const sharePopupUrl = document.getElementById("sharePopupUrl");
  const sharePopupTitle = document.getElementById("sharePopupTitle");
  const sharePopupHint = document.getElementById("sharePopupHint");
  if (!shareButton || !sharePopup || !sharePopupUrl || !sharePopupTitle || !sharePopupHint) {
    return;
  }

  printRenderer?.bind?.({
    printButton,
    contextProvider: () => ({
      title: viewModel.getTitle?.() ?? viewModel.getState().title ?? document.title ?? "Layers",
      layerModel,
      dynamicLayerData: typeof getPrintDynamicLayerData === "function" ? getPrintDynamicLayerData() : [],
    }),
  });

  printButton?.addEventListener("click", () => {
    sharePopup.hidden = true;
  });

  const hidePopup = () => {
    sharePopup.hidden = true;
  };

  shareButton.addEventListener("click", async (event) => {
    event.stopPropagation();
    sharePopupTitle.textContent = "Creating map URL";
    sharePopupUrl.textContent = "";
    sharePopupHint.textContent = "Saving your current layers, styling, position and zoom.";
    sharePopup.hidden = false;
    shareButton.disabled = true;
    try {
      const url = await copyShareUrl({ layerModel, screenRuntime, viewModel });
      sharePopupTitle.textContent = "Map URL copied";
      sharePopupUrl.textContent = url;
      sharePopupHint.textContent = "Send this link to open the same map state.";
      if (window.LayerV2) {
        window.LayerV2.shareUrl = url;
      }
    } catch (error) {
      console.warn("[layers] Failed to build share URL.", error);
      sharePopupTitle.textContent = "Share failed";
      sharePopupUrl.textContent = "";
      sharePopupHint.textContent = String(error?.message ?? error);
    } finally {
      shareButton.disabled = false;
    }
  });

  document.addEventListener("pointerdown", (event) => {
    if (
      sharePopup.hidden
      || sharePopup.contains(event.target)
      || shareButton.contains(event.target)
    ) {
      return;
    }
    hidePopup();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hidePopup();
    }
  });
}

export { bindShareControls, readShareSnapshotFromLocation };
