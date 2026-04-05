// Geometry simplification for performance optimization
export class GeometrySimplifier {
  constructor() {
    this.simplificationCache = new Map();
  }
  
  // Douglas-Peucker simplification
  simplify(geometry, tolerance, options = {}) {
    const cacheKey = this.generateCacheKey(geometry, tolerance, options);
    
    if (this.simplificationCache.has(cacheKey)) {
      return this.simplificationCache.get(cacheKey);
    }
    
    const simplified = this.douglasPeucker(geometry, tolerance, options);
    
    // Cache result
    this.simplificationCache.set(cacheKey, simplified);
    
    const originalPoints = this.countPoints(geometry);
    const simplifiedPoints = this.countPoints(simplified);
    const reduction = ((originalPoints - simplifiedPoints) / originalPoints * 100).toFixed(1);
    
    console.log(`📐 Simplified geometry: ${reduction}% point reduction`);
    
    return simplified;
  }
  
  // Douglas-Peucker algorithm implementation
  douglasPeucker(geometry, tolerance, options = {}) {
    if (geometry.type === 'Point') {
      return geometry;
    }
    
    if (geometry.type === 'LineString' || geometry.type === 'MultiLineString') {
      return this.simplifyLine(geometry, tolerance, options);
    }
    
    if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') {
      return this.simplifyPolygon(geometry, tolerance, options);
    }
    
    return geometry;
  }
  
  // Simplify line geometry
  simplifyLine(geometry, tolerance, options) {
    const coords = geometry.coordinates;
    
    if (geometry.type === 'MultiLineString') {
      return {
        ...geometry,
        coordinates: coords.map(lineCoords => this.simplifyLineString(lineCoords, tolerance, options))
      };
    }
    
    return {
      ...geometry,
      coordinates: this.simplifyLineString(coords, tolerance, options)
    };
  }
  
  // Simplify LineString
  simplifyLineString(points, tolerance) {
    if (points.length < 3) return points;
    
    // Douglas-Peucker for line
    const simplified = [points[0]];
    let prevPoint = points[0];
    
    for (let i = 1; i < points.length - 1; i++) {
      const currentPoint = points[i];
      
      if (this.getPerpendicularDistance(prevPoint, currentPoint, points[i + 1]) > tolerance) {
        simplified.push(currentPoint);
        prevPoint = currentPoint;
      }
    }
    
    simplified.push(points[points.length - 1]);
    return simplified;
  }
  
  // Simplify polygon geometry
  simplifyPolygon(geometry, tolerance, options = {}) {
    const coords = geometry.coordinates;
    
    if (geometry.type === 'MultiPolygon') {
      return {
        ...geometry,
        coordinates: coords.map(polygonCoords => 
          this.simplifyPolygonRing(polygonCoords[0], tolerance, options)
        )
      };
    }
    
    return {
      ...geometry,
      coordinates: [
        this.simplifyPolygonRing(coords[0], tolerance, options)
      ]
    };
  }
  
  // Simplify polygon ring
  simplifyPolygonRing(points, tolerance, options = {}) {
    if (points.length < 4) return points; // Triangle is minimum
    
    // Douglas-Peucker for polygon
    const simplified = [points[0]];
    let prevPoint = points[0];
    
    for (let i = 1; i < points.length; i++) {
      const currentPoint = points[i];
      const nextPoint = points[(i + 1) % points.length];
      
      if (this.getPerpendicularDistance(prevPoint, currentPoint, nextPoint) > tolerance) {
        simplified.push(currentPoint);
        prevPoint = currentPoint;
      }
    }
    
    // Ensure polygon is closed
    if (simplified[simplified.length - 1] !== simplified[0]) {
      simplified.push(simplified[simplified.length - 1]);
    }
    
    return simplified;
  }
  
  // Calculate perpendicular distance from point to line
  getPerpendicularDistance(point, lineStart, lineEnd) {
    const dx = lineEnd[0] - lineStart[0];
    const dy = lineEnd[1] - lineStart[1];
    
    if (dx === 0 && dy === 0) {
      return this.getDistance(point, lineStart);
    }
    
    const t = Math.max(0, Math.min(1, 
      ((point[0] - lineStart[0]) * dx + (point[1] - lineStart[1]) * dy) / (dx * dx + dy * dy)
    ));
    
    const projectionX = lineStart[0] + t * dx;
    const projectionY = lineStart[1] + t * dy;
    
    return this.getDistance(point, [projectionX, projectionY]);
  }
  
  // Calculate distance between two points
  getDistance(point1, point2) {
    const dx = point2[0] - point1[0];
    const dy = point2[1] - point1[1];
    return Math.sqrt(dx * dx + dy * dy);
  }
  
  // Count points in geometry
  countPoints(geometry) {
    let count = 0;
    
    const countPointsInArray = (points) => {
      count += points.length;
    };
    
    if (geometry.type === 'Point') {
      count = 1;
    } else if (geometry.type === 'LineString') {
      countPointsInArray(geometry.coordinates);
    } else if (geometry.type === 'MultiLineString') {
      geometry.coordinates.forEach(countPointsInArray);
    } else if (geometry.type === 'Polygon') {
      geometry.coordinates.forEach(countPointsInArray);
    } else if (geometry.type === 'MultiPolygon') {
      geometry.coordinates.forEach(polygon => {
        polygon.forEach(countPointsInArray);
      });
    }
    
    return count;
  }
  
  // Generate cache key
  generateCacheKey(geometry, tolerance, options) {
    const geometryHash = this.hashGeometry(geometry);
    const optionsHash = JSON.stringify(options);
    return `${geometryHash}-${tolerance}-${optionsHash}`;
  }
  
  // Simple geometry hash
  hashGeometry(geometry) {
    const coords = JSON.stringify(geometry.coordinates);
    let hash = 0;
    
    for (let i = 0; i < coords.length; i++) {
      hash = ((hash << 5) - hash + coords.charCodeAt(i)) & 0xffffffff;
      hash = (hash << 5) - hash; // Additional mixing
    }
    
    return hash.toString(36);
  }
  
  // Clear cache
  clearCache() {
    this.simplificationCache.clear();
    console.log('🗑️ Geometry simplification cache cleared');
  }
  
  // Get cache statistics
  getCacheStats() {
    return {
      size: this.simplificationCache.size,
      memoryUsage: this.estimateCacheMemory()
    };
  }
  
  estimateCacheMemory() {
    let totalMemory = 0;
    
    for (const [key, value] of this.simplificationCache) {
      // Rough estimation: 1KB per cached geometry
      totalMemory += 1024;
    }
    
    return totalMemory;
  }
}
