// Layer culling system for efficient rendering
export class LayerCulling {
  constructor(map) {
    this.map = map;
    this.visibleLayers = new Set();
    this.layerBounds = new Map();
    this.cullingDistance = 1000; // 1km culling distance
    this.lastViewport = null;
    
    this.initializeLayerBounds();
  }
  
  // Initialize layer bounds for culling
  initializeLayerBounds() {
    // Simplified bounds for major regions (in real implementation, 
    // these would be calculated from actual data)
    this.layerBounds.set('australia', {
      north: -10,
      south: -44,
      east: 154,
      west: 113
    });
    
    this.layerBounds.set('europe', {
      north: 71,
      south: 36,
      east: 40,
      west: -10
    });
    
    this.layerBounds.set('americas', {
      north: 83,
      south: -55,
      east: -30,
      west: -170
    });
    
    this.layerBounds.set('asia', {
      north: 77,
      south: -10,
      east: 180,
      west: 25
    });
  }
  
  // Check if layer should be visible
  shouldLayerBeVisible(layerId, bounds = null) {
    const viewport = bounds || this.map.getBounds();
    const layerBounds = this.layerBounds.get(layerId);
    
    if (!layerBounds) {
      return true; // No bounds = always visible
    }
    
    // Check if layer bounds intersect viewport
    const intersects = this.boundsIntersect(viewport, layerBounds);
    
    // Add distance-based culling for layers outside viewport
    if (!intersects) {
      return false;
    }
    
    // Check distance-based culling for near-viewport layers
    const distance = this.getDistanceToViewport(viewport, layerBounds);
    if (distance > this.cullingDistance) {
      return false;
    }
    
    return true;
  }
  
  // Bounds intersection test
  boundsIntersect(bounds1, bounds2) {
    return !(bounds2.east < bounds1.west ||
             bounds2.west > bounds1.east ||
             bounds2.north < bounds1.south ||
             bounds2.south > bounds1.north);
  }
  
  // Calculate distance from bounds to viewport
  getDistanceToViewport(viewport, layerBounds) {
    // Simple distance calculation (center to center)
    const viewportCenter = {
      x: (viewport.west + viewport.east) / 2,
      y: (viewport.north + viewport.south) / 2
    };
    
    const layerCenter = {
      x: (layerBounds.west + layerBounds.east) / 2,
      y: (layerBounds.north + layerBounds.south) / 2
    };
    
    const dx = viewportCenter.x - layerCenter.x;
    const dy = viewportCenter.y - layerCenter.y;
    
    return Math.sqrt(dx * dx + dy * dy);
  }
  
  // Update layer visibility based on viewport
  updateLayerVisibility() {
    const currentViewport = this.map.getBounds();
    
    // Check if viewport changed significantly
    if (this.viewportChanged(currentViewport)) {
      this.lastViewport = currentViewport;
      
      // Update all layer visibility
      this.updateAllLayers();
    }
  }
  
  // Check if viewport changed significantly
  viewportChanged(newViewport) {
    if (!this.lastViewport) return true;
    
    const threshold = 0.1; // 10% change threshold
    
    const widthChanged = Math.abs(newViewport.east - newViewport.west) / 
                          (this.lastViewport.east - this.lastViewport.west) > threshold;
    
    const heightChanged = Math.abs(newViewport.north - newViewport.south) / 
                           (this.lastViewport.north - this.lastViewport.south) > threshold;
    
    return widthChanged || heightChanged;
  }
  
  // Update visibility for all layers
  updateAllLayers() {
    const viewport = this.map.getBounds();
    
    // Define layer groups (in real implementation, this would come from layer model)
    const layerGroups = {
      australia: ['australia-fill', 'australia-outline'],
      europe: ['countries-fill', 'countries-vector'],
      americas: ['transport-rail'],
      asia: ['olympics-gold', 'olympics-silver', 'olympics-bronze']
    };
    
    Object.entries(layerGroups).forEach(([region, layers]) => {
      const shouldBeVisible = this.shouldLayerBeVisible(region, viewport);
      
      layers.forEach(layerId => {
        const isVisible = this.map.getLayer(layerId);
        
        if (isVisible) {
          const currentVisibility = this.map.getLayoutProperty(layerId, 'visibility');
          const newVisibility = shouldBeVisible ? 'visible' : 'none';
          
          if (currentVisibility !== newVisibility) {
            this.map.setLayoutProperty(layerId, 'visibility', newVisibility);
            
            if (shouldBeVisible) {
              this.visibleLayers.add(layerId);
            } else {
              this.visibleLayers.delete(layerId);
            }
          }
        }
      });
    });
  }
  
  // Get culling statistics
  getCullingStats() {
    return {
      totalLayers: this.layerBounds.size,
      visibleLayers: this.visibleLayers.size,
      culledLayers: this.layerBounds.size - this.visibleLayers.size,
      cullingDistance: this.cullingDistance,
      lastViewport: this.lastViewport
    };
  }
  
  // Set culling distance
  setCullingDistance(distance) {
    this.cullingDistance = distance;
    console.log(`🎯 Layer culling distance set to ${distance}km`);
  }
  
  // Enable/disable culling
  setCullingEnabled(enabled) {
    this.cullingEnabled = enabled;
    if (enabled) {
      this.map.on('moveend', () => this.updateLayerVisibility());
      console.log('✅ Layer culling enabled');
    } else {
      this.map.off('moveend', () => this.updateLayerVisibility());
      console.log('❌ Layer culling disabled');
    }
  }
}
