# Earthlab

Clean rebuild workspace for the next Atlas map runtime.

## Intent
- Build from the working `earth-lab` lessons, not from the legacy main-app Earth runtime.
- Keep this project simple:
  - MapLibre as the map shell
  - deck overlay for Earth rendering
  - compact top controls
  - local persisted styling state
- Treat the surrounding `atlas-product` repo as reference material, not architecture to preserve.

## Keep
- Supabase schema and upload ideas that have already proven solid
- styling/state patterns worth reusing
- the stable overlaid Earth renderer direction

## Drop
- interleaved Earth rendering
- legacy Earth runtime exceptions
- separate polar overlay machinery
- renderer baggage that only exists for compatibility
