function createViewModel(initialState = null) {
  const state = {
    projectionId: "globe",
    center: { longitude: 0, latitude: 0 },
    zoom: 1.1,
    bearing: 0,
    pitch: 0,
    print: {
      page: "A3",
      orientation: "portrait",
      includeQr: true,
      dpiTarget: 300,
    },
  };

  if (initialState && typeof initialState === "object") {
    if (typeof initialState.projectionId === "string") {
      state.projectionId = initialState.projectionId;
    }
    const longitude = Number(initialState.center?.longitude);
    const latitude = Number(initialState.center?.latitude);
    if (Number.isFinite(longitude) && Number.isFinite(latitude)) {
      state.center = { longitude, latitude };
    }
    ["zoom", "bearing", "pitch"].forEach((key) => {
      const value = Number(initialState[key]);
      if (Number.isFinite(value)) {
        state[key] = value;
      }
    });
  }

  function getState() {
    return structuredClone(state);
  }

  return {
    getState,
  };
}

export { createViewModel };
