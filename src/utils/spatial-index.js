// Spatial indexing for fast bounds queries
export class SpatialIndex {
  constructor() {
    this.index = null;
    this.features = [];
  }
  
  // Load spatial index library (using simple RBush implementation)
  async loadSpatialIndex() {
    if (!this.index) {
      // Dynamic import to avoid bundling if not needed
      const { default: RBush } = await import('https://unpkg.com/rbush@3.0.1/rbush.min.js');
      this.index = new RBush(9); // 9 dimensions for bounds [minX, minY, maxX, maxY]
    }
  }
  
  // Index features for fast lookup
  indexFeatures(features) {
    this.features = features;
    
    // Create bounding boxes for each feature
    const items = features.map((feature, index) => {
      const bounds = this.calculateBounds(feature);
      return {
        minX: bounds.minX,
        minY: bounds.minY,
        maxX: bounds.maxX,
        maxY: bounds.maxY,
        feature: feature,
        index: index
      };
    });
    
    // Bulk load into spatial index
    this.index.load(items);
    console.log(`🗺️ Indexed ${features.length} features for fast spatial queries`);
  }
  
  // Calculate bounds for a feature
  calculateBounds(feature) {
    if (feature.bbox) {
      return {
        minX: feature.bbox[0],
        minY: feature.bbox[1], 
        maxX: feature.bbox[2],
        maxY: feature.bbox[3]
      };
    }
    
    // Calculate bounds from geometry
    const coords = feature.geometry.coordinates;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    const processCoords = (coordArray) => {
      for (const coord of coordArray) {
        if (Array.isArray(coord[0])) {
          // MultiPolygon or MultiLineString
          for (const subCoord of coord) {
            processCoords(subCoord);
          }
        } else {
          // Regular coordinate array
          for (const point of coord) {
            minX = Math.min(minX, point[0]);
            minY = Math.min(minY, point[1]);
            maxX = Math.max(maxX, point[0]);
            maxY = Math.max(maxY, point[1]);
          }
        }
      }
    };
    
    if (feature.geometry.type === 'Polygon') {
      processCoords(coords);
    } else if (feature.geometry.type === 'MultiPolygon') {
      processCoords(coords);
    } else if (feature.geometry.type === 'LineString') {
      processCoords(coords);
    } else if (feature.geometry.type === 'MultiLineString') {
      processCoords(coords);
    }
    
    return { minX, minY, maxX, maxY };
  }
  
  // Fast spatial query
  query(bounds) {
    if (!this.index) {
      console.warn('Spatial index not loaded');
      return [];
    }
    
    // Search spatial index
    const results = this.index.search({
      minX: bounds.west,
      minY: bounds.south,
      maxX: bounds.east,
      maxY: bounds.north
    });
    
    return results.map(item => item.feature);
  }
  
  // Query with buffer (for features near viewport)
  queryWithBuffer(bounds, bufferKm = 10) {
    // Convert buffer from km to degrees (rough approximation)
    const bufferDegrees = bufferKm / 111; // 1 degree ≈ 111 km
    
    const bufferedBounds = {
      west: bounds.west - bufferDegrees,
      south: bounds.south - bufferDegrees,
      east: bounds.east + bufferDegrees,
      north: bounds.north + bufferDegrees
    };
    
    return this.query(bufferedBounds);
  }
  
  // Get statistics
  getStats() {
    return {
      indexedFeatures: this.features.length,
      indexSize: this.index ? this.index.size : 0,
      memoryUsage: this.estimateMemoryUsage()
    };
  }
  
  estimateMemoryUsage() {
    // Rough memory estimation
    const featureSize = 200; // bytes per feature estimate
    const indexOverhead = this.index ? this.index.size * 64 : 0; // 64 bytes per index entry
    
    return {
      features: this.features.length * featureSize,
      index: indexOverhead,
      total: (this.features.length * featureSize) + indexOverhead
    };
  }
}
