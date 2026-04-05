function createStyleModel() {
  const styles = {
    "landuse-vivid": {
      fillPalette: ["#87c98b", "#58a46e", "#b4df8b"],
      printMode: "vector-preferred",
      labelPriority: "medium",
    },
    "trails-emphasis": {
      stroke: "#ffd17b",
      strokeWidth: 1.6,
      printMode: "vector-required",
      labelPriority: "high",
    },
    "user-default": {
      pointColor: "#ff8c69",
      lineColor: "#ffe9cc",
      areaFill: "#c85e50",
      printMode: "vector-required",
      labelPriority: "high",
    },
  };

  function getStyles() {
    return structuredClone(styles);
  }

  return {
    getStyles,
  };
}

export { createStyleModel };
