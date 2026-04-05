function createShareStateUrl(viewState) {
  const url = new URL("https://example.invalid/atlas");
  url.hash = new URLSearchParams({
    projection: viewState.projectionId,
    lon: String(viewState.center.longitude),
    lat: String(viewState.center.latitude),
    zoom: String(viewState.zoom),
    page: viewState.print.page,
  }).toString();
  return url.toString();
}

export { createShareStateUrl };
