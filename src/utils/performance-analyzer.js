// Performance analyzer for detailed metrics and optimization suggestions
export class PerformanceAnalyzer {
  constructor() {
    this.metrics = {
      frameRates: [],
      loadTimes: new Map(),
      memorySnapshots: [],
      userInteractions: [],
      renderTimes: new Map(),
      viewportChanges: 0
    };
    
    this.thresholds = {
      targetFPS: 60,
      minFPS: 30,
      maxLoadTime: 3000, // 3 seconds
      maxMemoryUsage: 80, // 80%
      maxInteractionDelay: 100 // 100ms
    };
    
    this.isMonitoring = false;
    this.analysisCallbacks = [];
  }
  
  // Start performance monitoring
  startMonitoring() {
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
  
  // Stop performance monitoring
  stopMonitoring() {
    this.isMonitoring = false;
    
    if (this.frameRateInterval) {
      clearInterval(this.frameRateInterval);
    }
    
    if (this.memoryInterval) {
      clearInterval(this.memoryInterval);
    }
    
    console.log('📊 Performance monitoring stopped');
  }
  
  // Monitor frame rate
  startFrameRateMonitoring() {
    let lastFrameTime = performance.now();
    
    this.frameRateInterval = setInterval(() => {
      const now = performance.now();
      const frameTime = now - lastFrameTime;
      lastFrameTime = now;
      
      this.metrics.frameRates.push(frameTime);
      
      // Keep only last 60 frames (1 second)
      if (this.metrics.frameRates.length > 60) {
        this.metrics.frameRates = this.metrics.frameRates.slice(-60);
      }
    }, 1000 / 60); // 60 FPS target
  }
  
  // Monitor memory usage
  startMemoryMonitoring() {
    this.memoryInterval = setInterval(() => {
      if ('memory' in performance) {
        const memory = performance.memory;
        
        this.metrics.memorySnapshots.push({
          used: memory.usedJSHeapSize,
          total: memory.totalJSHeapSize,
          limit: memory.jsHeapSizeLimit,
          timestamp: Date.now()
        });
        
        // Keep only last 100 snapshots
        if (this.metrics.memorySnapshots.length > 100) {
          this.metrics.memorySnapshots = this.metrics.memorySnapshots.slice(-100);
        }
      }
    }, 5000); // Every 5 seconds
  }
  
  // Monitor user interactions
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
  
  // Monitor viewport changes
  startViewportMonitoring() {
    // This would integrate with the map instance
    console.log('🗺️ Viewport monitoring started');
  }
  
  // Get interaction details
  getInteractionDetails(event) {
    const details = { timestamp: performance.now() };
    
    switch (event.type) {
      case 'click':
        details.x = event.clientX;
        details.y = event.clientY;
        break;
      case 'mousemove':
        details.x = event.clientX;
        details.y = event.clientY;
        details.movement = true;
        break;
      case 'zoomstart':
      case 'zoomend':
        details.zoom = event.zoom || this.getCurrentZoom();
        break;
    }
    
    return details;
  }
  
  // Record data loading time
  recordDataLoad(dataType, identifier, loadTime) {
    this.metrics.loadTimes.set(`${dataType}-${identifier}`, loadTime);
    
    if (loadTime > this.thresholds.maxLoadTime) {
      console.warn(`⚠️ Slow data load detected: ${dataType} ${identifier} took ${loadTime}ms`);
    }
  }
  
  // Record render time
  recordRenderTime(component, renderTime) {
    this.metrics.renderTimes.set(component, renderTime);
    
    if (renderTime > 16.67) { // < 60fps
      console.warn(`⚠️ Slow render: ${component} took ${renderTime}ms`);
    }
  }
  
  // Analyze performance metrics
  analyze() {
    if (this.metrics.frameRates.length === 0) {
      return { error: 'No data to analyze' };
    }
    
    const analysis = {
      frameRate: this.analyzeFrameRate(),
      memory: this.analyzeMemory(),
      loading: this.analyzeLoadingTimes(),
      interactions: this.analyzeInteractions(),
      recommendations: this.generateRecommendations()
    };
    
    console.log('📊 Performance Analysis:', analysis);
    return analysis;
  }
  
  // Analyze frame rate
  analyzeFrameRate() {
    const frameTimes = this.metrics.frameRates;
    const avgFrameTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
    const fps = 1000 / avgFrameTime;
    const minFPS = 1000 / Math.max(...frameTimes);
    const maxFPS = 1000 / Math.min(...frameTimes);
    
    const isStable = Math.abs(maxFPS - minFPS) < 10; // Less than 10 FPS variation
    
    return {
      current: fps,
      average: fps,
      min: minFPS,
      max: maxFPS,
      isStable,
      isBelowTarget: fps < this.thresholds.minFPS,
      score: Math.min(100, (fps / this.thresholds.targetFPS) * 100)
    };
  }
  
  // Analyze memory usage
  analyzeMemory() {
    if (this.metrics.memorySnapshots.length === 0) {
      return { error: 'No memory data' };
    }
    
    const snapshots = this.metrics.memorySnapshots;
    const latest = snapshots[snapshots.length - 1];
    const peak = Math.max(...snapshots.map(s => s.used));
    const average = snapshots.reduce((sum, s) => sum + s.used, 0) / snapshots.length;
    
    const usagePercent = (latest.used / latest.limit) * 100;
    const isMemoryPressure = usagePercent > this.thresholds.maxMemoryUsage;
    
    return {
      current: usagePercent,
      average: (average / latest.limit) * 100,
      peak: (peak / latest.limit) * 100,
      isMemoryPressure,
      trend: this.getMemoryTrend()
    };
  }
  
  // Get memory usage trend
  getMemoryTrend() {
    if (this.metrics.memorySnapshots.length < 10) return 'stable';
    
    const recent = this.metrics.memorySnapshots.slice(-10);
    const first = recent[0];
    const last = recent[recent.length - 1];
    
    const change = ((last.used - first.used) / first.used) * 100;
    
    if (change > 10) return 'increasing';
    if (change < -10) return 'decreasing';
    return 'stable';
  }
  
  // Analyze loading times
  analyzeLoadingTimes() {
    const loadTimes = Array.from(this.metrics.loadTimes.values());
    
    if (loadTimes.length === 0) {
      return { error: 'No loading data' };
    }
    
    const average = loadTimes.reduce((a, b) => a + b, 0) / loadTimes.length;
    const slowest = Math.max(...loadTimes);
    const fastest = Math.min(...loadTimes);
    
    const slowLoads = loadTimes.filter(time => time > this.thresholds.maxLoadTime).length;
    const slowLoadPercent = (slowLoads / loadTimes.length) * 100;
    
    return {
      average,
      slowest,
      fastest,
      slowLoadCount: slowLoads,
      slowLoadPercent,
      isAcceptable: slowLoadPercent < 10
    };
  }
  
  // Analyze user interactions
  analyzeInteractions() {
    const interactions = this.metrics.userInteractions;
    
    if (interactions.length === 0) {
      return { error: 'No interaction data' };
    }
    
    const responseTimes = [];
    let lastClickTime = 0;
    
    interactions.forEach(interaction => {
      if (interaction.type === 'click') {
        if (lastClickTime > 0) {
          responseTimes.push(interaction.timestamp - lastClickTime);
        }
        lastClickTime = interaction.timestamp;
      }
    });
    
    const avgResponseTime = responseTimes.length > 0 
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length 
      : 0;
    
    return {
      totalInteractions: interactions.length,
      clickCount: interactions.filter(i => i.type === 'click').length,
      avgResponseTime,
      isResponsive: avgResponseTime < this.thresholds.maxInteractionDelay
    };
  }
  
  // Generate optimization recommendations
  generateRecommendations() {
    const recommendations = [];
    
    const frameRateAnalysis = this.analyzeFrameRate();
    const memoryAnalysis = this.analyzeMemory();
    const loadingAnalysis = this.analyzeLoadingTimes();
    
    // Frame rate recommendations
    if (frameRateAnalysis.isBelowTarget) {
      recommendations.push({
        type: 'performance',
        priority: 'high',
        issue: 'Low frame rate',
        solution: 'Reduce layer complexity or enable culling',
        impact: 'User experience will be choppy'
      });
    }
    
    // Memory recommendations
    if (memoryAnalysis.isMemoryPressure) {
      recommendations.push({
        type: 'memory',
        priority: 'critical',
        issue: 'High memory usage',
        solution: 'Reduce cache sizes or enable LOD',
        impact: 'Risk of browser crashes'
      });
    }
    
    // Loading recommendations
    if (!loadingAnalysis.isAcceptable) {
      recommendations.push({
        type: 'loading',
        priority: 'high',
        issue: 'Slow data loading',
        solution: 'Enable service worker caching or use smaller datasets',
        impact: 'Poor user experience during initial load'
      });
    }
    
    // Interaction recommendations
    if (!this.analyzeInteractions().isResponsive) {
      recommendations.push({
        type: 'interaction',
        priority: 'medium',
        issue: 'Slow interaction response',
        solution: 'Optimize event handlers or reduce processing',
        impact: 'App feels unresponsive'
      });
    }
    
    return recommendations;
  }
  
  // Add analysis callback
  onAnalysisComplete(callback) {
    this.analysisCallbacks.push(callback);
  }
  
  // Get comprehensive report
  getReport() {
    return {
      monitoring: this.isMonitoring,
      duration: this.isMonitoring ? Date.now() - this.startTime : 0,
      frameRate: this.analyzeFrameRate(),
      memory: this.analyzeMemory(),
      loading: this.analyzeLoadingTimes(),
      interactions: this.analyzeInteractions(),
      recommendations: this.generateRecommendations()
    };
  }
}
