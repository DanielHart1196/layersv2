// Level of Detail (LOD) manager for adaptive data loading
export class LODManager {
  constructor() {
    this.detailLevels = {
      countries: {
        low: {
          url: '/data/world-atlas/countries-low-detail.json',
          maxZoom: 3,
          simplifyTolerance: 2.0,
          maxFeatures: 500
        },
        medium: {
          url: '/data/world-atlas/countries-medium-detail.json', 
          maxZoom: 6,
          simplifyTolerance: 1.0,
          maxFeatures: 1500
        },
        high: {
          url: '/data/world-atlas/countries-10m.json',
          maxZoom: 10,
          simplifyTolerance: 0.5,
          maxFeatures: null // All features
        }
      },
      australia: {
        low: {
          url: '/data/world-atlas/australia-low.json',
          maxZoom: 3,
          simplifyTolerance: 3.0,
          tiles: ['a', 'b', 'c', 'd'] // Only 4 tiles at low zoom
        },
        medium: {
          url: '/data/world-atlas/australia-medium.json',
          maxZoom: 6,
          simplifyTolerance: 1.5,
          tiles: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] // 8 tiles at medium zoom
        },
        high: {
          url: '/data/world-atlas/australia-land-d.geojson', // Current high detail
          maxZoom: 10,
          simplifyTolerance: 0.5,
          tiles: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] // All 8 tiles
        }
      }
    };
  }
  
  getOptimalDataUrl(layerType, zoom, deviceProfile = {}) {
    const levels = this.detailLevels[layerType];
    if (!levels) return null;
    
    // Determine appropriate detail level
    let detailLevel;
    
    if (zoom <= levels.low.maxZoom) {
      detailLevel = 'low';
    } else if (zoom <= levels.medium.maxZoom) {
      detailLevel = 'medium';
    } else {
      detailLevel = 'high';
    }
    
    // Adjust for device capabilities
    if (deviceProfile.isLowEnd && detailLevel === 'high') {
      detailLevel = 'medium'; // Downgrade for low-end devices
    }
    
    if (deviceProfile.isMobile && detailLevel === 'high') {
      detailLevel = 'medium'; // Downgrade for mobile
    }
    
    const config = levels[detailLevel];
    
    console.log(`🎯 LOD: ${layerType} at zoom ${zoom} → ${detailLevel} detail`);
    
    return {
      url: config.url,
      detailLevel,
      maxZoom: config.maxZoom,
      simplifyTolerance: config.simplifyTolerance,
      maxFeatures: config.maxFeatures,
      tiles: config.tiles || null
    };
  }
  
  // Get all available detail levels for a layer type
  getAvailableLevels(layerType) {
    return Object.keys(this.detailLevels[layerType] || {});
  }
  
  // Estimate file size for a detail level
  estimateFileSize(layerType, detailLevel) {
    const sizeMap = {
      countries: { low: 0.5, medium: 3, high: 14 }, // MB
      australia: { low: 2, medium: 8, high: 17 } // MB
    };
    
    return sizeMap[layerType]?.[detailLevel] || 1;
  }
  
  // Get loading strategy based on zoom progression
  getLoadingStrategy(layerType, fromZoom, toZoom) {
    const strategy = [];
    
    for (let z = fromZoom; z <= toZoom; z++) {
      const config = this.getOptimalDataUrl(layerType, z);
      
      if (z === toZoom) {
        strategy.push({ zoom: z, ...config, priority: 'high' });
      } else {
        strategy.push({ zoom: z, ...config, priority: 'medium' });
      }
    }
    
    return strategy;
  }
}
