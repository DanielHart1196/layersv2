function createPrintRendererAdapter() {
  const contract = {
    primaryRenderer: "svg-print-adapter",
    responsibilities: [
      "print-specific projection render",
      "page layout with qr, legend, title, attribution",
      "high-resolution vector-first output",
      "consistent symbol scaling for print",
    ],
    nonGoals: [
      "touch interaction",
      "screen-hot-path animation",
    ],
  };

  function getContract() {
    return structuredClone(contract);
  }

  return {
    getContract,
  };
}

export { createPrintRendererAdapter };
