// Web Worker for heavy GeoJSON processing
importScripts('https://unpkg.com/@maplibre/geojson-vt@3.5.0/dist/geojson-vt.min.js');
importScripts('https://unpkg.com/@maplibre/vt-pbf@3.5.0/dist/vt-pbf.min.js');

class GeoJSONProcessor {
  constructor() {
    this.tileCache = new Map();
    this.processingQueue = [];
    this.isProcessing = false;
  }
  
  // Process GeoJSON to vector tiles
  processToTiles(geojsonData, options = {}) {
    const cacheKey = this.generateCacheKey(geojsonData, options);
    
    if (this.tileCache.has(cacheKey)) {
      return Promise.resolve(this.tileCache.get(cacheKey));
    }
    
    return new Promise((resolve) => {
      // Add to processing queue
      this.processingQueue.push({ geojsonData, options, resolve, cacheKey });
      
      if (!this.isProcessing) {
        this.processQueue();
      }
    });
  }
  
  async processQueue() {
    if (this.processingQueue.length === 0) return;
    
    this.isProcessing = true;
    
    while (this.processingQueue.length > 0) {
      const { geojsonData, options, resolve, cacheKey } = this.processingQueue.shift();
      
      try {
        console.log('🔄 Worker processing GeoJSON to vector tiles...');
        
        // Default tile options
        const tileOptions = {
          buffer: 64,
          extent: 4096,
          indexMaxZoom: 5,
          maxZoom: 6,
          tolerance: 3,
          ...options
        };
        
        // Convert GeoJSON to vector tiles
        const tileIndex = new self.geojsonvt(geojsonData, tileOptions);
        
        // Cache result
        this.tileCache.set(cacheKey, tileIndex);
        
        console.log(`✅ Processed ${geojsonData.features?.length || 0} features to tiles`);
        
        resolve(tileIndex);
        
      } catch (error) {
        console.error('❌ GeoJSON processing error:', error);
        resolve(null);
      }
    }
    
    this.isProcessing = false;
  }
  
  generateCacheKey(geojsonData, options) {
    // Generate cache key based on data hash and options
    const dataHash = this.hashString(JSON.stringify(geojsonData));
    const optionsHash = this.hashString(JSON.stringify(options));
    return `${dataHash}-${optionsHash}`;
  }
  
  // Simple string hash function
  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  }
  
  // Clear cache
  clearCache() {
    this.tileCache.clear();
    console.log('🗑️ Cleared GeoJSON tile cache');
  }
  
  // Get cache statistics
  getCacheStats() {
    return {
      size: this.tileCache.size,
      queueLength: this.processingQueue.length,
      isProcessing: this.isProcessing
    };
  }
}

// Initialize processor
const processor = new GeoJSONProcessor();

// Handle messages from main thread
self.onmessage = function(event) {
  const { type, data, id, options } = event.data;
  
  switch (type) {
    case 'process-to-tiles':
      processor.processToTiles(data, options).then(result => {
        self.postMessage({
          type: 'process-complete',
          id: id,
          result: result
        });
      });
      break;
      
    case 'clear-cache':
      processor.clearCache();
      self.postMessage({
        type: 'cache-cleared',
        id: id
      });
      break;
      
    case 'get-stats':
      self.postMessage({
        type: 'stats',
        id: id,
        stats: processor.getCacheStats()
      });
      break;
      
    default:
      console.warn('Unknown message type:', type);
  }
};
