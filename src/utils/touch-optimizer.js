// Touch-optimized interactions for mobile devices
export class TouchOptimizer {
  constructor(map) {
    this.map = map;
    this.isTouch = 'ontouchstart' in window;
    this.touchState = {
      isActive: false,
      touches: new Map(),
      lastTapTime: 0,
      doubleTapDelay: 300,
      longPressDelay: 500,
      swipeThreshold: 50,
      pinchThreshold: 20
    };
    
    this.initializeTouchEvents();
  }
  
  // Initialize touch events
  initializeTouchEvents() {
    if (!this.isTouch) {
      console.log('📱 Touch not available, using mouse events');
      return;
    }
    
    const mapContainer = this.map.getContainer();
    
    // Touch events with passive listeners for better performance
    mapContainer.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: true });
    mapContainer.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: true });
    mapContainer.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: true });
    mapContainer.addEventListener('touchcancel', this.handleTouchEnd.bind(this), { passive: true });
    
    // Prevent default touch behaviors that interfere with map
    mapContainer.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    mapContainer.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    
    console.log('📱 Touch events initialized');
  }
  
  // Handle touch start
  handleTouchStart(event) {
    this.touchState.isActive = true;
    this.touchState.lastTapTime = Date.now();
    
    // Track all active touches
    Array.from(event.changedTouches).forEach(touch => {
      this.touchState.touches.set(touch.identifier, {
        startX: touch.clientX,
        startY: touch.clientY,
        currentX: touch.clientX,
        currentY: touch.clientY,
        startTime: Date.now()
      });
    });
  }
  
  // Handle touch move
  handleTouchMove(event) {
    if (!this.touchState.isActive) return;
    
    Array.from(event.changedTouches).forEach(touch => {
      const touchData = this.touchState.touches.get(touch.identifier);
      if (touchData) {
        touchData.currentX = touch.clientX;
        touchData.currentY = touch.clientY;
        
        // Detect swipe gesture
        const deltaX = touch.clientX - touchData.startX;
        const deltaY = touch.clientY - touchData.startY;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        
        if (distance > this.touchState.swipeThreshold) {
          this.handleSwipe(touch.identifier, deltaX, deltaY);
        }
      }
    });
  }
  
  // Handle touch end
  handleTouchEnd(event) {
    if (!this.touchState.isActive) return;
    
    const currentTime = Date.now();
    const tapTime = currentTime - this.touchState.lastTapTime;
    
    // Check for double tap
    if (tapTime < this.touchState.doubleTapDelay) {
      this.handleDoubleTap();
    } else {
      // Check for long press
      Array.from(event.changedTouches).forEach(touch => {
        const touchData = this.touchState.touches.get(touch.identifier);
        if (touchData) {
          const pressDuration = currentTime - touchData.startTime;
          
          if (pressDuration > this.touchState.longPressDelay) {
            this.handleLongPress(touch.identifier);
          } else {
            this.handleTap(touch.identifier);
          }
        }
      });
    }
    
    // Clean up touch state
    this.touchState.touches.clear();
    this.touchState.isActive = false;
    this.touchState.lastTapTime = currentTime;
  }
  
  // Handle tap gesture
  handleTap(touchId) {
    // Convert touch to map click
    const touchData = this.touchState.touches.get(touchId);
    if (!touchData) return;
    
    const point = this.map.unproject([touchData.currentX, touchData.currentY]);
    
    // Simulate click event
    const clickEvent = new MouseEvent('click', {
      clientX: touchData.currentX,
      clientY: touchData.currentY,
      bubbles: true,
      cancelable: true
    });
    
    this.map.getContainer().dispatchEvent(clickEvent);
    
    console.log('👆 Tap gesture handled');
  }
  
  // Handle double tap
  handleDoubleTap() {
    // Simulate double click
    const doubleClickEvent = new MouseEvent('dblclick', {
      bubbles: true,
      cancelable: true
    });
    
    this.map.getContainer().dispatchEvent(doubleClickEvent);
    console.log('👆👆 Double tap gesture handled');
  }
  
  // Handle long press
  handleLongPress(touchId) {
    // Simulate right click for context menu
    const touchData = this.touchState.touches.get(touchId);
    if (!touchData) return;
    
    const contextEvent = new MouseEvent('contextmenu', {
      clientX: touchData.currentX,
      clientY: touchData.currentY,
      bubbles: true,
      cancelable: true
    });
    
    this.map.getContainer().dispatchEvent(contextEvent);
    console.log('👆 Long press gesture handled');
  }
  
  // Handle swipe gesture
  handleSwipe(touchId, deltaX, deltaY) {
    // Determine swipe direction
    let direction;
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);
    
    if (absDeltaX > absDeltaY) {
      direction = deltaX > 0 ? 'right' : 'left';
    } else {
      direction = deltaY > 0 ? 'down' : 'up';
    }
    
    // Convert swipe to map pan
    const swipeEvent = new CustomEvent('swipe', {
      detail: {
        direction,
        deltaX,
        deltaY,
        velocity: Math.sqrt(deltaX * deltaX + deltaY * deltaY)
      }
    });
    
    this.map.getContainer().dispatchEvent(swipeEvent);
    console.log(`👆 Swipe gesture handled: ${direction}`);
  }
  
  // Handle pinch gesture (for zoom)
  handlePinch(event) {
    if (event.touches.length !== 2) return;
    
    const touch1 = event.touches[0];
    const touch2 = event.touches[1];
    
    const distance = Math.sqrt(
      Math.pow(touch2.clientX - touch1.clientX, 2) +
      Math.pow(touch2.clientY - touch1.clientY, 2)
    );
    
    // Store initial pinch distance for zoom calculation
    if (!this.touchState.pinchDistance) {
      this.touchState.pinchDistance = distance;
      this.touchState.pinchStartZoom = this.map.getZoom();
    } else {
      // Calculate zoom change based on pinch
      const scale = distance / this.touchState.pinchDistance;
      const zoomDelta = Math.log(scale) / Math.LN2;
      
      this.map.setZoom(this.touchState.pinchStartZoom + zoomDelta);
      console.log(`🤏 Pinch zoom: ${zoomDelta > 0 ? '+' : ''}${zoomDelta.toFixed(2)}`);
    }
  }
  
  // Optimize touch targets for mobile
  optimizeTouchTargets() {
    const mapContainer = this.map.getContainer();
    
    // Increase touch target size for mobile
    const touchTargets = mapContainer.querySelectorAll('.maplibregl-ctrl');
    touchTargets.forEach(target => {
      const rect = target.getBoundingClientRect();
      const minSize = Math.max(44, Math.min(rect.width, rect.height)); // Minimum 44px
      
      target.style.minWidth = `${minSize}px`;
      target.style.minHeight = `${minSize}px`;
      target.style.padding = '10px'; // Add padding for easier touching
    });
    
    console.log('📱 Touch targets optimized');
  }
  
  // Get touch statistics
  getTouchStats() {
    return {
      isTouch: this.isTouch,
      activeTouches: this.touchState.touches.size,
      touchState: { ...this.touchState }
    };
  }
  
  // Enable/disable touch optimizations
  setTouchOptimizations(enabled) {
    if (enabled) {
      this.optimizeTouchTargets();
      console.log('✅ Touch optimizations enabled');
    } else {
      console.log('❌ Touch optimizations disabled');
    }
  }
}
