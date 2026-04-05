// Application bootstrap
import { bootstrapApplication } from "./app/bootstrap.js";
import { createMapInstance, isRealPmtilesUrl } from "./renderers/screen/maplibre/map-instance.js";

// Initialize application
bootstrapApplication({
  createMapInstance,
  isRealPmtilesUrl
});
