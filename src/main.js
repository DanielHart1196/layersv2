// Performance optimization utilities
import { PerformanceMonitor } from "./utils/performance-monitor.js";
import { AdaptiveQuality } from "./utils/adaptive-quality.js";
import { MemoryManager } from "./utils/memory-manager.js";
import { LODManager } from "./utils/lod-manager.js";

// Application bootstrap
import { bootstrapApplication } from "./app/bootstrap.js";
import { createMapInstance, isRealPmtilesUrl } from "./renderers/screen/maplibre/map-instance.js";

// Initialize performance systems
const performanceMonitor = new PerformanceMonitor();
const adaptiveQuality = new AdaptiveQuality();
const memoryManager = new MemoryManager();
const lodManager = new LODManager();

// Start monitoring
performanceMonitor.startMonitoring();

// Initialize application with optimizations
bootstrapApplication({
  performanceMonitor,
  adaptiveQuality,
  memoryManager,
  lodManager
});
