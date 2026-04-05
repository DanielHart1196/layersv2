# Atlas Product

New product foundation for the atlas app.

## Intent
- Keep `layers/` as the restored reference prototype.
- Build the product foundation here with clean boundaries for:
  - static basemap delivery
  - editable runtime vectors
  - shared view/projection state
  - print/export

## Current State
- Runnable scaffold only
- Shared model boundaries are explicit
- No renderer lock-in yet
- Screen renderer now mounts a live MapLibre globe shell
- PMTiles source contract now points at local self-hosted archive paths

## First Milestones
1. Prove shared layer/view/style state
2. Add PMTiles basemap source contract
3. Add runtime editable vector store
4. Add print/export state contract

## Controlled Hosting
- Static PMTiles archives belong under `public/pmtiles/`
- Current expected filenames:
  - `public/pmtiles/basemap-main.pmtiles`
  - `public/pmtiles/terrain-dem.pmtiles`
- The app should not depend on third-party hotlinked build archives for production
- Generate or copy your own archives into that folder, then the screen runtime can attach them directly
