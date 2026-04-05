// Texture atlas for reducing draw calls
export class TextureAtlas {
  constructor() {
    this.textures = new Map();
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.atlasSize = 2048; // 2048x2048 atlas
    this.currentX = 0;
    this.currentY = 0;
    this.rowHeight = 64; // Height for each texture in atlas
  }
  
  // Add texture to atlas
  addTexture(id, imageUrl, options = {}) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onload = () => {
        try {
          const width = options.width || img.width;
          const height = options.height || img.height;
          
          // Check if texture fits in current atlas
          if (this.currentX + width > this.atlasSize) {
            this.createNewAtlas();
          }
          
          // Draw texture to atlas
          this.ctx.drawImage(img, this.currentX, this.currentY, width, height);
          
          const textureInfo = {
            id,
            x: this.currentX,
            y: this.currentY,
            width,
            height,
            uv: {
              u: this.currentX / this.atlasSize,
              v: this.currentY / this.atlasSize,
              u2: (this.currentX + width) / this.atlasSize,
              v2: (this.currentY + height) / this.atlasSize
            }
          };
          
          this.textures.set(id, textureInfo);
          this.currentX += width + 2; // 2px padding
          
          console.log(`🎨 Added texture ${id} to atlas`);
          resolve(textureInfo);
          
        } catch (error) {
          reject(error);
        }
      };
      
      img.onerror = () => reject(new Error(`Failed to load texture: ${imageUrl}`));
      img.src = imageUrl;
    });
  }
  
  // Create new atlas when current is full
  createNewAtlas() {
    console.log('🎨 Creating new texture atlas');
    
    // Save current atlas
    const currentAtlas = this.canvas.toDataURL();
    
    // Create new canvas
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.canvas.width = this.atlasSize;
    this.canvas.height = this.atlasSize;
    
    // Reset position
    this.currentX = 0;
    this.currentY = 0;
    
    console.log('🎨 New texture atlas created');
  }
  
  // Get texture UV coordinates
  getTextureUV(id) {
    return this.textures.get(id);
  }
  
  // Get atlas as data URL
  getAtlasDataURL() {
    return this.canvas.toDataURL();
  }
  
  // Get atlas statistics
  getAtlasStats() {
    return {
      textureCount: this.textures.size,
      usedSpace: (this.currentX / this.atlasSize) * 100,
      remainingSpace: ((this.atlasSize - this.currentY) / this.atlasSize) * 100,
      atlasSize: `${this.atlasSize}x${this.atlasSize}`
    };
  }
  
  // Optimize atlas layout
  optimizeLayout() {
    // Sort textures by usage frequency for better packing
    const sortedTextures = Array.from(this.textures.entries())
      .sort((a, b) => (b[1].accessCount || 0) - (a[1].accessCount || 0));
    
    // Rebuild atlas with optimal layout
    this.rebuildAtlas(sortedTextures);
  }
  
  // Rebuild atlas with new layout
  rebuildAtlas(sortedTextures) {
    this.textures.clear();
    this.currentX = 0;
    this.currentY = 0;
    
    // Re-add textures in optimal order
    for (const [id, textureInfo] of sortedTextures) {
      const img = new Image();
      img.onload = () => {
        this.ctx.drawImage(img, this.currentX, this.currentY, textureInfo.width, textureInfo.height);
        this.currentX += textureInfo.width + 2;
        
        if (this.currentX + textureInfo.width > this.atlasSize) {
          this.currentY += this.rowHeight;
          this.currentX = 0;
        }
      };
      img.src = textureInfo.imageUrl;
    }
  }
}
