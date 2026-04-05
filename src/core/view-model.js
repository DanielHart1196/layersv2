function createViewModel() {
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

  function getState() {
    return structuredClone(state);
  }

  return {
    getState,
  };
}

export { createViewModel };
