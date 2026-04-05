// Performance monitoring and metrics tracking
export class PerformanceMonitor {
  constructor() {
    this.metrics = {
      startTime: performance.now(),
      mapLibreLoad: 0,
      dataLoad: new Map(),
      renderTimes: new Map(),
      memoryUsage: [],
      userInteractions: [],
      viewportChanges: 0
    };
    
    this.observers = [];
    this.frameRateInterval = null;
    this.memoryInterval = null;
    this.isMonitoring = false;
    this.initializeMonitoring();
  }
  
  sinitializeMonitoring() {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    this.startTime = performance.now();
    
    // Monitor frame rate
    this.startFrameRateMonitoring();
    
    // Monitor memory usage
    this.startMemoryMonitoring();
    
    // Monitor user interactions
    this.startInteractionMonitoring();
    
    // Monitor viewport changes
    this.startViewportMonitoring();
    
    console.log('📊 Performance monitoring started');
  }
  
  startFrameRateMonitoring() {
    let lastFrameTime = performance.now();
    
    const measureFrameRate = () => {
      const now = performance.now();
      const frameTime = now - lastFrameTime;
      lastFrameTime = now;
      
      this.metrics.renderTimes.push(frameTime);
      
      // Keep only last 60 frames (1 second at 60fps)
      if (this.metrics.renderTimes.length > 60) {
        this.metrics.renderTimes = this.metrics.renderTimes.slice(-60);
      }
      
      requestAnimationFrame(measureFrameRate);
    };
    
    requestAnimationFrame(measureFrameRate);
  }
  
  startMemoryMonitoring() {
    if (!('memory' in performance)) return;
    
    this.memoryInterval = setInterval(() => {
      this.metrics.memoryUsage.push({
        used: performance.memory.usedJSHeapSize,
        total: performance.memory.totalJSHeapSize,
        limit: performance.memory.jsHeapSizeLimit,
        timestamp: Date.now()
      });
      
      // Keep only last 100 measurements
      if (this.metrics.memoryUsage.length > 100) {
        this.metrics.memoryUsage = this.metrics.memoryUsage.slice(-100);
      }
    }, 5000); // Every 5 seconds
  }
  
  startInteractionMonitoring() {
    // Monitor click, move, zoom interactions
    ['click', 'mousemove', 'zoomstart', 'zoomend'].forEach(eventType => {
      document.addEventListener(eventType, (event) => {
        this.metrics.userInteractions.push({
          type: eventType,
          timestamp: performance.now(),
          details: this.getInteractionDetails(event)
        });
      });
    });
  }
  
  startViewportMonitoring() {
    // This would integrate with the map instance
    console.log('🗺️ Viewport monitoring started');
  }
  
  checkPerformanceWarnings() {
    // Check for slow data loading
    Object.entries(this.metrics.dataLoad).forEach(([layer, loadTime]) => {
      if (loadTime > 3000) {
        console.warn(`⚠️ Slow data loading detected: ${layer} took ${loadTime}ms`);
      }
    });
    
    // Check for low memory
    if (this.metrics.memoryUsage.length > 0) {
      const latest = this.metrics.memoryUsage[this.metrics.memoryUsage.length - 1];
      const memoryUsagePercent = (latest.used / latest.total) * 100;
      
      if (memoryUsagePercent > 80) {
        console.warn(`⚠️ High memory usage: ${memoryUsagePercent.toFixed(1)}%`);
      }
    }
    
    // Check for low frame rate
    if (this.metrics.renderTimes.length > 10) {
      const avgFrameTime = this.metrics.renderTimes.slice(-10).reduce((a, b) => a + b, 0) / 10;
      const fps = 1000 / avgFrameTime;
      
      if (fps < 30) {
        console.warn(`⚠️ Low frame rate: ${fps.toFixed(1)}fps`);
      }
    }
  }
  
  // Timing methods
  startDataLoad(layerName) {
    this.metrics.dataLoad[layerName] = performance.now();
  }
  
  endDataLoad(layerName) {
    if (this.metrics.dataLoad[layerName]) {
      const loadTime = performance.now() - this.metrics.dataLoad[layerName];
      this.metrics.dataLoad[layerName] = loadTime;
      
      console.log(`📊 ${layerName} loaded in ${loadTime.toFixed(1)}ms`);
    }
  }
  
  startMapLibreLoad() {
    this.metrics.mapLibreLoad = performance.now();
  }
  
  endMapLibreLoad() {
    const loadTime = performance.now() - this.metrics.mapLibreLoad;
    console.log(`🗺️ MapLibre loaded in ${loadTime.toFixed(1)}ms`);
  }
  
  getMetrics() {
    const avgFrameTime = this.metrics.renderTimes.length > 0 
      ? this.metrics.renderTimes.reduce((a, b) => a + b, 0) / this.metrics.renderTimes.length 
      : 0;
    
    return {
      ...this.metrics,
      averageFrameTime: avgFrameTime,
      fps: avgFrameTime > 0 ? 1000 / avgFrameTime : 0,
      totalLoadTime: performance.now() - this.metrics.startTime
    };
  }
  
  // Get performance profile for adaptive quality
  getPerformanceProfile() {
    const avgFrameTime = this.metrics.averageFrameTime;
    const memoryInfo = this.metrics.memoryUsage[this.metrics.memoryUsage.length - 1] || {};
    
    const isLowEnd = navigator.hardwareConcurrency <= 2;
    const isMobile = /Android|iPhone|iPad|iPod/.test(navigator.userAgent);
    const memoryGB = navigator.deviceMemory || 4;
    
    return {
      isLowEnd,
      isMobile,
      memoryGB,
      avgFrameTime,
      memoryUsagePercent: memoryInfo.used ? (memoryInfo.used / memoryInfo.total) * 100 : 0,
      recommendations: this.getRecommendations(avgFrameTime, isLowEnd, isMobile)
    };
  }
  
  getRecommendations(avgFrameTime, isLowEnd, isMobile) {
    const recommendations = [];
    
    if (avgFrameTime > 16.67) { // < 60fps
      recommendations.push('reduce-layer-complexity');
    }
    
    if (isLowEnd) {
      recommendations.push('use-simplified-geometries');
      recommendations.push('reduce-max-features');
    }
    
    if (isMobile) {
      recommendations.push('disable-animations');
      recommendations.push('reduce-tile-resolution');
    }
    
    return recommendations;
  }
}
