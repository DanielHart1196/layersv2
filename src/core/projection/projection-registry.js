const PROJECTIONS = {
  globe: {
    id: "globe",
    label: "Globe",
    runtime: "screen-primary",
    printSupport: "specialized",
  },
  mercator: {
    id: "mercator",
    label: "Mercator",
    runtime: "screen-supported",
    printSupport: "strong",
  },
  equalEarth: {
    id: "equalEarth",
    label: "Equal Earth",
    runtime: "print-preferred",
    printSupport: "strong",
  },
  naturalEarth: {
    id: "naturalEarth",
    label: "Natural Earth",
    runtime: "print-preferred",
    printSupport: "strong",
  },
};

function getProjectionRegistry() {
  return structuredClone(PROJECTIONS);
}

export { getProjectionRegistry };
