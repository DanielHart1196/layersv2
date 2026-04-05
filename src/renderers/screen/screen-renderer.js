function createScreenRendererAdapter() {
  const contract = {
    primaryRenderer: "maplibre-screen-adapter",
    responsibilities: [
      "interactive globe and supported screen projections",
      "fast static basemap draw",
      "runtime vector overlay composition",
      "mobile-first touch interaction",
    ],
    nonGoals: [
      "authoritative print output",
      "arbitrary projection breadth",
    ],
  };

  function getContract() {
    return structuredClone(contract);
  }

  return {
    getContract,
  };
}

export { createScreenRendererAdapter };
