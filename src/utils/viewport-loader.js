// Viewport-based data loading - only load what user can see
export class ViewportLoader {
  constructor(map) {
    this.map = map;
    this.loadedLayers = new Set();
    this.viewportBounds = null;
    
    // Define layer bounds (simplified for example)
    this.layerBounds = {
      australia: {
        north: -10,
        south: -44,
        east: 154,
        west: 113
      },
      europe: {
        north: 71,
        south: 36,
        east: 40,
        west: -10
      },
      americas: {
        north: 83,
        south: -55,
        east: -30,
        west: -170
      }
    };
  }
  
  // Check if layer intersects current viewport
  layerInViewport(layerId) {
    if (!this.viewportBounds) return false;
    
    const bounds = this.layerBounds[layerId];
    if (!bounds) return true; // Load if no bounds defined
    
    return this.viewportBounds.intersects(bounds);
  }
  
  // Update viewport bounds
  updateViewport() {
    this.viewportBounds = this.map.getBounds();
    
    // Trigger loading checks for viewport-based layers
    this.checkAndLoadLayers();
  }
  
  // Check and load layers that should be visible
  async checkAndLoadLayers() {
    // Australia layers
    if (this.layerInViewport('australia') && !this.loadedLayers.has('australia')) {
      this.loadedLayers.add('australia');
      this.loadAustraliaLayers();
    }
    
    // Europe layers (countries)
    if (this.layerInViewport('europe') && !this.loadedLayers.has('countries')) {
      this.loadedLayers.add('countries');
      this.loadCountriesLayers();
    }
  }
  
  async loadAustraliaLayers() {
    // Dynamically import to avoid bundling
    const { attachAustraliaFillLayer, attachAustraliaOutlineLayer } = await import('../renderers/screen/maplibre/map-instance.js');
    // Implementation would need to be extracted from the main file
  }
  
  async loadCountriesLayers() {
    // Dynamically import countries loading
    const { attachCountriesLandLayers, attachCountriesVectorLayer } = await import('../renderers/screen/maplibre/map-instance.js');
  }
  
  // Initialize viewport monitoring
  initialize() {
    this.map.on('moveend', () => this.updateViewport());
    this.map.on('zoomend', () => this.updateViewport());
    
    // Initial check
    this.updateViewport();
  }
}
