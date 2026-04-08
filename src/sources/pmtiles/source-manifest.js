function createPmtilesManifest() {
  return [
    {
      id: "basemap-main",
      kind: "pmtiles",
      role: "basemap",
      url: "/pmtiles/basemap-main.pmtiles",
      layers: ["earth", "water", "landuse", "roads", "boundaries", "buildings", "places"],
      notes: [
        "self-hosted archive path under layerv2/public/pmtiles/",
        "replace with your own generated archive before expecting live basemap data",
      ],
      mutable: false,
    },
    {
      id: "terrain-dem",
      kind: "pmtiles",
      role: "terrain",
      url: "/pmtiles/terrain-dem.pmtiles",
      layers: ["dem", "hillshade"],
      notes: [
        "optional terrain archive under layerv2/public/pmtiles/",
      ],
      mutable: false,
    },
    {
      id: "osm-outline",
      kind: "pmtiles",
      role: "earth-outline",
      url: "/pmtiles/osm-outline.pmtiles",
      layers: ["coastlines"],
      notes: [
        "OSM coastlines for Earth -> Outline",
      ],
      mutable: false,
    },
    ...["a", "b", "c", "d", "e", "f", "g", "h"].map((tileId) => ({
      id: `osm-outline-australia-${tileId}`,
      kind: "pmtiles",
      role: "earth-outline-test",
      url: `/pmtiles/osm-outline-australia-${tileId}.pmtiles`,
      layers: ["coastlines"],
      notes: [
        `Australia OSM coastline slice ${tileId.toUpperCase()} for high-detail testing`,
      ],
      mutable: false,
    })),
    ...["a", "b", "c", "d", "e", "f", "g", "h"].map((tileId) => ({
      id: `osm-land-australia-${tileId}`,
      kind: "pmtiles",
      role: "earth-land-test",
      url: `/pmtiles/osm-land-australia-${tileId}.pmtiles`,
      layers: ["land-fill"],
      notes: [
        `Australia OSM land slice ${tileId.toUpperCase()} for high-detail testing`,
      ],
      mutable: false,
    })),
    ...["a", "b", "c", "d"].map((tileId) => ({
      id: `osm-land-victoria-${tileId}`,
      kind: "pmtiles",
      role: "earth-land-test",
      url: `/pmtiles/osm-land-victoria-${tileId}.pmtiles`,
      layers: ["land-fill"],
      notes: [
        `Victoria-only OSM land tile ${tileId.toUpperCase()} for high-detail fill testing`,
      ],
      mutable: false,
    })),
    ...["a", "b", "c", "d"].map((tileId) => ({
      id: `osm-outline-victoria-${tileId}`,
      kind: "pmtiles",
      role: "earth-outline-test",
      url: `/pmtiles/osm-outline-victoria-${tileId}.pmtiles`,
      layers: ["coastlines"],
      notes: [
        `Victoria-only OSM coastlines tile ${tileId.toUpperCase()} for high-detail outline testing`,
      ],
      mutable: false,
    })),
  ];
}

export { createPmtilesManifest };
