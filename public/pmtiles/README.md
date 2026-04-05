# PMTiles Assets

Put self-hosted PMTiles archives in this directory.

Expected initial filenames:
- `basemap-main.pmtiles`
- `terrain-dem.pmtiles`

Notes:
- These archives are intentionally not committed here.
- The screen runtime already points at `/pmtiles/basemap-main.pmtiles` and `/pmtiles/terrain-dem.pmtiles`.
- Until those files exist, the app will still mount the live globe shell but the PMTiles-backed layers will not load real data.
