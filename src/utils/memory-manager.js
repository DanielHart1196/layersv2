// Memory management for optimal performance
export class MemoryManager {
  constructor(options = {}) {
    this.options = {
      maxMemoryMB: options.maxMemoryMB || 512, // Default 512MB limit
      cleanupThreshold: options.cleanupThreshold || 0.8, // Clean at 80% usage
      cleanupInterval: options.cleanupInterval || 30000, // Check every 30 seconds
      aggressiveCleanup: options.aggressiveCleanup || false
    };
    
    this.memoryStats = {
      used: 0,
      total: 0,
      limit: 0,
      lastCleanup: Date.now(),
      cleanupCount: 0
    };
    
    this.caches = new Map();
    this.lruCache = new Map();
    this.initializeMonitoring();
  }
  
  // Initialize memory monitoring
  initializeMonitoring() {
    if ('memory' in performance) {
      this.memoryStats.limit = performance.memory.jsHeapSizeLimit;
      
      // Start periodic memory monitoring
      setInterval(() => this.checkMemoryUsage(), this.options.cleanupInterval);
      
      // Listen for memory pressure
      if ('memory' in performance && 'pressure' in performance.memory) {
        performance.memory.addEventListener('pressure', (event) => {
          if (event.pressure === 'critical') {
            this.aggressiveCleanup();
          }
        });
      }
    }
    
    console.log('🧠 Memory manager initialized');
  }
  
  // Check current memory usage
  checkMemoryUsage() {
    if (!('memory' in performance)) return;
    
    const memory = performance.memory;
    const used = memory.usedJSHeapSize;
    const total = memory.totalJSHeapSize;
    const limit = memory.jsHeapSizeLimit;
    
    this.memoryStats.used = used;
    this.memoryStats.total = total;
    this.memoryStats.limit = limit;
    
    const usagePercent = (used / limit) * 100;
    
    // Trigger cleanup if threshold exceeded
    if (usagePercent > this.options.cleanupThreshold * 100) {
      this.performCleanup(usagePercent);
    }
    
    // Log memory warnings
    if (usagePercent > 90) {
      console.warn(`⚠️ Critical memory usage: ${usagePercent.toFixed(1)}%`);
    } else if (usagePercent > 75) {
      console.warn(`⚠️ High memory usage: ${usagePercent.toFixed(1)}%`);
    }
  }
  
  // Perform memory cleanup
  performCleanup(usagePercent) {
    const now = Date.now();
    
    // Prevent too frequent cleanups
    if (now - this.memoryStats.lastCleanup < 5000) {
      return;
    }
    
    this.memoryStats.lastCleanup = now;
    this.memoryStats.cleanupCount++;
    
    console.log(`🧹 Memory cleanup (${usagePercent.toFixed(1)}% usage)`);
    
    // Clear LRU cache
    this.clearLRUCache();
    
    // Clear old entries from regular cache
    this.clearOldCacheEntries();
    
    // Force garbage collection if available
    if (window.gc) {
      window.gc();
      console.log('🗑️ Forced garbage collection');
    }
    
    // Trigger cleanup event for application to respond
    window.dispatchEvent(new CustomEvent('memorycleanup', {
      detail: {
        usagePercent,
        cleanedItems: this.getCleanupStats()
      }
    }));
  }
  
  // Aggressive cleanup for critical memory situations
  aggressiveCleanup() {
    console.log('🚨 Aggressive memory cleanup triggered');
    
    // Clear all caches
    this.caches.clear();
    this.lruCache.clear();
    
    // Reduce cache sizes
    this.options.maxMemoryMB = Math.max(128, this.options.maxMemoryMB / 2);
    
    // Remove heavy layers from map
    this.removeHeavyLayers();
    
    // Force multiple garbage collections
    if (window.gc) {
      for (let i = 0; i < 3; i++) {
        window.gc();
      }
    }
  }
  
  // Clear LRU cache
  clearLRUCache() {
    const targetSize = Math.floor(this.lruCache.size / 2);
    const entries = Array.from(this.lruCache.entries());
    
    // Remove oldest half of entries
    for (let i = 0; i < targetSize; i++) {
      const [key, value] = entries[i];
      this.lruCache.delete(key);
    }
    
    console.log(`🗑️ Cleared ${targetSize} LRU cache entries`);
  }
  
  // Clear old cache entries
  clearOldCacheEntries() {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes
    
    for (const [key, entry] of this.caches.entries()) {
      if (now - entry.timestamp > maxAge) {
        this.caches.delete(key);
      }
    }
  }
  
  // Add item to cache with memory management
  addToCache(key, value, maxSize = null) {
    const size = this.estimateItemSize(value);
    const currentMemory = this.memoryStats.used;
    
    // Check if adding this item would exceed memory limit
    if (maxSize && currentMemory + size > this.options.maxMemoryMB * 1024 * 1024) {
      this.performCleanup((currentMemory / this.memoryStats.limit) * 100);
      return false;
    }
    
    // Add to LRU cache
    this.lruCache.set(key, {
      value,
      timestamp: Date.now(),
      size,
      accessCount: 1
    });
    
    // Limit LRU cache size
    this.limitLRUCacheSize();
    
    return true;
  }
  
  // Get item from cache
  getFromCache(key) {
    const entry = this.lruCache.get(key);
    
    if (entry) {
      entry.accessCount++;
      entry.timestamp = Date.now();
      
      // Move to end (most recently used)
      this.lruCache.delete(key);
      this.lruCache.set(key, entry);
    }
    
    return entry ? entry.value : null;
  }
  
  // Limit LRU cache size
  limitLRUCacheSize() {
    const maxEntries = Math.floor(this.options.maxMemoryMB * 1024 * 1024 / 1024); // 1KB per entry
    
    while (this.lruCache.size > maxEntries) {
      const firstKey = this.lruCache.keys().next().value;
      if (firstKey) {
        this.lruCache.delete(firstKey);
      }
    }
  }
  
  // Estimate item size
  estimateItemSize(item) {
    if (typeof item === 'string') {
      return item.length * 2; // Unicode characters are ~2 bytes
    } else if (typeof item === 'object') {
      return JSON.stringify(item).length * 2;
    } else {
      return 1024; // 1KB default
    }
  }
  
  // Remove heavy layers (implementation specific)
  removeHeavyLayers() {
    // This would integrate with the actual map instance
    console.log('🗑️ Heavy layers removed (implementation needed)');
  }
  
  // Get cleanup statistics
  getCleanupStats() {
    return {
      lastCleanup: this.memoryStats.lastCleanup,
      cleanupCount: this.memoryStats.cleanupCount,
      cacheSize: this.lruCache.size,
      memoryUsage: {
        used: this.memoryStats.used,
        total: this.memoryStats.total,
        limit: this.memoryStats.limit,
        percent: ((this.memoryStats.used / this.memoryStats.limit) * 100).toFixed(1)
      }
    };
  }
  
  // Get memory statistics
  getMemoryStats() {
    return {
      ...this.memoryStats,
      usagePercent: ((this.memoryStats.used / this.memoryStats.limit) * 100).toFixed(1),
      cacheStats: {
        lruSize: this.lruCache.size,
        regularSize: this.caches.size
      }
    };
  }
  
  // Set memory limits
  setMemoryLimit(limitMB) {
    this.options.maxMemoryMB = limitMB;
    this.memoryStats.limit = limitMB * 1024 * 1024;
    console.log(`🧠 Memory limit set to ${limitMB}MB`);
  }
  
  // Clear all caches
  clearAllCaches() {
    this.caches.clear();
    this.lruCache.clear();
    console.log('🗑️ All caches cleared');
  }
}
