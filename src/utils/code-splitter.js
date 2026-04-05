// Code splitting utilities for dynamic loading
export class CodeSplitter {
  constructor() {
    this.loadedChunks = new Set();
    this.loadingPromises = new Map();
    this.chunkRegistry = new Map();
    
    this.initializeChunkRegistry();
  }
  
  // Initialize chunk registry
  initializeChunkRegistry() {
    // Define chunks for different features
    this.chunkRegistry.set('empires', {
      module: './chunks/empires.js',
      dependencies: [],
      size: 'medium'
    });
    
    this.chunkRegistry.set('australia', {
      module: './chunks/australia.js', 
      dependencies: [],
      size: 'large'
    });
    
    this.chunkRegistry.set('countries', {
      module: './chunks/countries.js',
      dependencies: [],
      size: 'large'
    });
    
    this.chunkRegistry.set('olympics', {
      module: './chunks/olympics.js',
      dependencies: [],
      size: 'medium'
    });
    
    this.chunkRegistry.set('transport', {
      module: './chunks/transport.js',
      dependencies: [],
      size: 'small'
    });
    
    this.chunkRegistry.set('workers', {
      module: './chunks/workers.js',
      dependencies: [],
      size: 'medium'
    });
  }
  
  // Load chunk dynamically
  async loadChunk(chunkName) {
    if (this.loadedChunks.has(chunkName)) {
      return this.loadingPromises.get(chunkName) || Promise.resolve();
    }
    
    const chunkInfo = this.chunkRegistry.get(chunkName);
    if (!chunkInfo) {
      return Promise.reject(new Error(`Unknown chunk: ${chunkName}`));
    }
    
    console.log(`📦 Loading chunk: ${chunkName}`);
    
    const loadPromise = import(chunkInfo.module)
      .then(module => {
        this.loadedChunks.add(chunkName);
        this.loadingPromises.delete(chunkName);
        console.log(`✅ Chunk loaded: ${chunkName}`);
        return module;
      })
      .catch(error => {
        this.loadingPromises.delete(chunkName);
        console.error(`❌ Failed to load chunk: ${chunkName}`, error);
        throw error;
      });
    
    this.loadingPromises.set(chunkName, loadPromise);
    return loadPromise;
  }
  
  // Preload chunks based on user behavior
  preloadChunks(chunkNames) {
    const preloadPromises = chunkNames.map(name => this.loadChunk(name));
    
    return Promise.allSettled(preloadPromises);
  }
  
  // Load chunks with dependencies
  async loadChunkWithDependencies(chunkName) {
    const chunkInfo = this.chunkRegistry.get(chunkName);
    if (!chunkInfo || !chunkInfo.dependencies.length) {
      return this.loadChunk(chunkName);
    }
    
    console.log(`📦 Loading chunk with dependencies: ${chunkName}`);
    
    // Load dependencies first
    const dependencyPromises = chunkInfo.dependencies.map(dep => this.loadChunk(dep));
    
    await Promise.all(dependencyPromises);
    
    // Then load the main chunk
    return this.loadChunk(chunkName);
  }
  
  // Get chunk loading status
  getChunkStatus() {
    return {
      loaded: Array.from(this.loadedChunks),
      loading: Array.from(this.loadingPromises.keys()),
      registry: Array.from(this.chunkRegistry.keys())
    };
  }
  
  // Unload chunk to free memory
  unloadChunk(chunkName) {
    this.loadedChunks.delete(chunkName);
    
    // In a real implementation, you might need to handle module unloading
    console.log(`🗑️ Unloaded chunk: ${chunkName}`);
  }
  
  // Get loading statistics
  getLoadingStats() {
    const chunkInfo = Array.from(this.chunkRegistry.values());
    
    return {
      totalChunks: chunkInfo.length,
      loadedChunks: this.loadedChunks.size,
      loadingChunks: this.loadingPromises.size,
      chunkDetails: chunkInfo.map(info => ({
        name: info.module,
        size: info.size,
        dependencies: info.dependencies.length
      }))
    };
  }
  
  // Optimize chunk loading based on network
  optimizeChunkLoading(chunkNames, networkSpeed = 'unknown') {
    const strategies = {
      slow: {
        // Load chunks sequentially to avoid bandwidth saturation
        strategy: 'sequential',
        delay: 200 // 200ms between loads
      },
      fast: {
        // Load chunks in parallel
        strategy: 'parallel',
        delay: 0
      },
      unknown: {
        // Conservative approach
        strategy: 'sequential',
        delay: 100
      }
    };
    
    const strategy = strategies[networkSpeed] || strategies.unknown;
    
    console.log(`🌐 Using ${strategy.strategy} chunk loading strategy`);
    
    if (strategy.strategy === 'parallel') {
      return this.preloadChunks(chunkNames);
    } else {
      // Sequential loading
      const results = [];
      for (const chunkName of chunkNames) {
        const result = await this.loadChunk(chunkName);
        results.push(result);
        
        if (strategy.delay > 0) {
          await new Promise(resolve => setTimeout(resolve, strategy.delay));
        }
      }
      return results;
    }
  }
  
  // Create chunks for different features (this would be a build-time tool)
  static generateChunkConfig() {
    return {
      empires: {
        entry: './chunks/empires.js',
        imports: [
          './renderers/screen/maplibre/empires/roman-empire.js',
          './renderers/screen/maplibre/empires/mongol-empire.js',
          './renderers/screen/maplibre/empires/british-empire.js'
        ]
      },
      australia: {
        entry: './chunks/australia.js',
        imports: [
          './renderers/screen/maplibre/australia/australia-fill.js',
          './renderers/screen/maplibre/australia/australia-outline.js'
        ]
      },
      countries: {
        entry: './chunks/countries.js',
        imports: [
          './renderers/screen/maplibre/countries/countries-land.js',
          './renderers/screen/maplibre/countries/countries-vector.js'
        ]
      }
    };
  }
}
