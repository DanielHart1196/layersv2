// Adaptive quality settings based on device capabilities
export class AdaptiveQuality {
  constructor() {
    this.profile = this.detectDeviceProfile();
    this.settings = this.calculateOptimalSettings();
  }
  
  detectDeviceProfile() {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    
    // Get hardware info
    const concurrency = navigator.hardwareConcurrency || 4;
    const memory = navigator.deviceMemory || 4;
    const connection = navigator.connection || {};
    
    // Detect mobile
    const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/.test(navigator.userAgent);
    const isTablet = /iPad|Android(?!.*Mobile)|Tablet/.test(navigator.userAgent);
    const isLowEnd = concurrency <= 2 || memory <= 2 || isMobile;
    
    // Get GPU info
    const renderer = gl ? gl.getParameter(gl.RENDERER) : 'Unknown';
    const vendor = gl ? gl.getParameter(gl.VENDOR) : 'Unknown';
    
    // Detect WebGL capabilities
    let maxTextureSize = 2048; // Default
    let supportsWebGL2 = false;
    
    if (gl) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        maxTextureSize = gl.getParameter(debugInfo.MAX_TEXTURE_SIZE);
      }
      
      // Check for WebGL2 support
      const canvas2 = document.createElement('canvas');
      const gl2 = canvas2.getContext('webgl2');
      supportsWebGL2 = !!gl2;
    }
    
    const profile = {
      isMobile,
      isTablet,
      isLowEnd,
      isHighEnd: !isLowEnd && concurrency >= 8 && memory >= 8,
      concurrency,
      memoryGB: memory,
      connection: {
        effectiveType: connection.effectiveType || '4g',
        downlink: connection.downlink || 1,
        rtt: connection.rtt || 100
      },
      gpu: {
        renderer,
        vendor,
        maxTextureSize,
        supportsWebGL2
      },
      canvas: {
        maxTextureSize
      }
    };
    
    console.log('🔍 Device Profile:', profile);
    return profile;
  }
  
  calculateOptimalSettings() {
    const { isMobile, isLowEnd, memoryGB, concurrency, connection } = this.profile;
    
    const settings = {
      // Rendering settings
      rendering: {
        enableShadows: !isMobile && !isLowEnd,
        enableAnimations: !isMobile,
        maxFPS: isMobile ? 30 : (isLowEnd ? 45 : 60),
        textureResolution: this.getTextureResolution(),
        antialiasing: !isLowEnd
      },
      
      // Data loading settings
      data: {
        maxConcurrentLoads: Math.max(1, Math.floor(concurrency / 2)),
        cacheSize: isLowEnd ? 50 : 200,
        enableLOD: true,
        lodBias: isLowEnd ? 'conservative' : 'balanced',
        preloadRadius: isMobile ? 1 : 3 // Zoom levels to preload
      },
      
      // Feature settings
      features: {
        maxVisibleFeatures: isLowEnd ? 500 : (isMobile ? 1000 : 2000),
        simplifyTolerance: this.getSimplificationTolerance(),
        enableSpatialIndex: !isLowEnd,
        enableWorkers: concurrency >= 4
      },
      
      // Quality presets
      quality: this.getQualityPreset()
    };
    
    console.log('⚙️ Optimal Settings:', settings);
    return settings;
  }
  
  getTextureResolution() {
    const { isMobile, isLowEnd, memoryGB } = this.profile;
    
    if (isMobile) return 'low';
    if (isLowEnd) return 'medium';
    if (memoryGB < 4) return 'medium';
    return 'high';
  }
  
  getSimplificationTolerance() {
    const { isMobile, isLowEnd } = this.profile;
    
    if (isLowEnd) return 2.0;
    if (isMobile) return 1.5;
    return 0.5;
  }
  
  getQualityPreset() {
    const { isMobile, isLowEnd, isHighEnd } = this.profile;
    
    if (isMobile) return 'mobile';
    if (isLowEnd) return 'low';
    if (isHighEnd) return 'high';
    return 'medium';
  }
  
  // Update settings based on performance feedback
  updateBasedOnPerformance(performanceMetrics) {
    const { avgFrameTime, memoryUsagePercent } = performanceMetrics;
    
    // Auto-adjust quality if performance is poor
    if (avgFrameTime > 20) { // < 50fps
      this.settings.rendering.maxFPS = Math.max(30, this.settings.rendering.maxFPS - 10);
      this.settings.features.maxVisibleFeatures = Math.max(100, this.settings.features.maxVisibleFeatures - 200);
      console.log('🔽 Auto-adjusting quality down due to poor performance');
    }
    
    if (memoryUsagePercent > 85) {
      this.settings.data.cacheSize = Math.max(25, this.settings.data.cacheSize - 50);
      this.settings.features.enableSpatialIndex = false; // Disable memory-intensive features
      console.log('🔽 Auto-adjusting memory usage due to high memory');
    }
    
    // Auto-adjust quality up if performance is good
    if (avgFrameTime < 10 && memoryUsagePercent < 50) { // > 100fps, low memory
      this.settings.rendering.maxFPS = Math.min(60, this.settings.rendering.maxFPS + 10);
      this.settings.features.maxVisibleFeatures = Math.min(3000, this.settings.features.maxVisibleFeatures + 500);
      console.log('🔼 Auto-adjusting quality up due to good performance');
    }
    
    return this.settings;
  }
  
  getProfile() {
    return this.profile;
  }
  
  getSettings() {
    return this.settings;
  }
  
  // Export preset configurations
  static getPresets() {
    return {
      mobile: {
        rendering: { enableShadows: false, enableAnimations: false, maxFPS: 30, textureResolution: 'low' },
        data: { maxConcurrentLoads: 1, cacheSize: 50, enableLOD: true, lodBias: 'conservative' },
        features: { maxVisibleFeatures: 500, simplifyTolerance: 2.0, enableSpatialIndex: false }
      },
      low: {
        rendering: { enableShadows: false, enableAnimations: true, maxFPS: 45, textureResolution: 'medium' },
        data: { maxConcurrentLoads: 2, cacheSize: 100, enableLOD: true, lodBias: 'conservative' },
        features: { maxVisibleFeatures: 1000, simplifyTolerance: 1.5, enableSpatialIndex: false }
      },
      medium: {
        rendering: { enableShadows: true, enableAnimations: true, maxFPS: 60, textureResolution: 'high' },
        data: { maxConcurrentLoads: 3, cacheSize: 200, enableLOD: true, lodBias: 'balanced' },
        features: { maxVisibleFeatures: 2000, simplifyTolerance: 1.0, enableSpatialIndex: true }
      },
      high: {
        rendering: { enableShadows: true, enableAnimations: true, maxFPS: 60, textureResolution: 'high' },
        data: { maxConcurrentLoads: 4, cacheSize: 500, enableLOD: true, lodBias: 'performance' },
        features: { maxVisibleFeatures: 3000, simplifyTolerance: 0.5, enableSpatialIndex: true }
      }
    };
  }
}
