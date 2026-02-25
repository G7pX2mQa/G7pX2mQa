
/* =========================================
   SHADERS
   ========================================= */

const VERTEX_SHADER = `
attribute vec2 aPosition;
attribute vec2 aTexCoord;
attribute float aAlpha;
attribute float aDarkness;

uniform vec2 uResolution;

varying vec2 vTexCoord;
varying float vAlpha;
varying float vDarkness;

void main() {
    // Map pixel coordinates to clip space (-1 to 1)
    vec2 clipSpace = (aPosition / uResolution) * 2.0 - 1.0;
    
    // Flip Y because WebGL 0 is bottom-left, but screen 0 is top-left
    gl_Position = vec4(clipSpace.x, -clipSpace.y, 0.0, 1.0);
    
    vTexCoord = aTexCoord;
    vAlpha = aAlpha;
    vDarkness = aDarkness;
}
`;

const FRAGMENT_SHADER = `
precision mediump float;

varying vec2 vTexCoord;
varying float vAlpha;
varying float vDarkness;

uniform sampler2D uTexture;

void main() {
    vec4 color = texture2D(uTexture, vTexCoord);
    if (color.a < 0.1) discard;
    
    // Apply darkening (simulating depth/shadow for lower layers)
    vec3 dimmed = color.rgb * (1.0 - vDarkness);
    
    gl_FragColor = vec4(dimmed, color.a * vAlpha);
}
`;

/* =========================================
   RENDERER
   ========================================= */

export class WaterwheelRenderer {
    constructor() {
        this.canvas = null;
        this.gl = null;
        this.program = null;
        
        this.textures = new Map(); // url -> WebGLTexture
        this.textureLoading = new Set();
        
        this.buffer = null;
        this.maxQuads = 2000;
        this.vertexData = new Float32Array(this.maxQuads * 6 * 6); // 6 verts per quad, 6 floats per vert
        this.quadCount = 0;
        
        // Constants
        this.LAYERS_PER_WHEEL = 24; 
        this.LAYER_DIST_PX = 1.0; // Distance between layers in pixels
        
        this._resizeObserver = null;
    }

    init(container) {
        // Create Canvas
        this.canvas = document.createElement('canvas');
        this.canvas.className = 'waterwheel-canvas';
        this.canvas.style.position = 'absolute';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.pointerEvents = 'none';
        this.canvas.style.zIndex = '10'; 
        
        container.appendChild(this.canvas);
        
        // Context
        this.gl = this.canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });
        if (!this.gl) {
            console.error("WebGL not supported for Waterwheels");
            return;
        }
        
        // Shader
        this.program = this.createProgram(VERTEX_SHADER, FRAGMENT_SHADER);
        
        // Buffers
        this.buffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, this.vertexData.byteLength, this.gl.DYNAMIC_DRAW);
        
        // Resize Handling
        this.resize();
        this._resizeObserver = new ResizeObserver(() => this.resize());
        this._resizeObserver.observe(container);
    }

    createShader(type, source) {
        const s = this.gl.createShader(type);
        this.gl.shaderSource(s, source);
        this.gl.compileShader(s);
        if (!this.gl.getShaderParameter(s, this.gl.COMPILE_STATUS)) {
            console.error("Shader Error:", this.gl.getShaderInfoLog(s));
            return null;
        }
        return s;
    }

    createProgram(vs, fs) {
        const p = this.gl.createProgram();
        const v = this.createShader(this.gl.VERTEX_SHADER, vs);
        const f = this.createShader(this.gl.FRAGMENT_SHADER, fs);
        this.gl.attachShader(p, v);
        this.gl.attachShader(p, f);
        this.gl.linkProgram(p);
        return p;
    }

    resize() {
        if (!this.canvas) return;
        const rect = this.canvas.getBoundingClientRect();
        
        // Handle high DPI
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }

    getTexture(url) {
        if (this.textures.has(url)) return this.textures.get(url);
        
        if (this.textureLoading.has(url)) return null; // Loading
        
        this.textureLoading.add(url);
        const img = new Image();
        img.src = url;
        img.onload = () => {
            const tex = this.gl.createTexture();
            this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
            this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, img);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
            
            this.textures.set(url, tex);
            this.textureLoading.delete(url);
        };
        
        return null; // Not ready yet
    }

    /*
      items: Array of { 
        x, y, // Center position in pixels relative to canvas
        size, // Width/Height in pixels
        rotation, // Radians (0-2PI)
        imageUrl, 
        alpha // Opacity
      }
    */
    render(items) {
        if (!this.gl || !this.program || !this.canvas) return;
        
        const gl = this.gl;
        const canvasRect = this.canvas.getBoundingClientRect();
        
        // Clear
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        
        gl.useProgram(this.program);
        
        // Uniforms
        const uRes = gl.getUniformLocation(this.program, 'uResolution');
        gl.uniform2f(uRes, this.canvas.width, this.canvas.height);
        
        // Enable Blending
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        
        // Batch by texture to minimize draw calls
        // Group items by texture
        const batches = new Map();
        for (const item of items) {
            if (!batches.has(item.imageUrl)) batches.set(item.imageUrl, []);
            batches.get(item.imageUrl).push(item);
        }
        
        const aPos = gl.getAttribLocation(this.program, 'aPosition');
        const aTex = gl.getAttribLocation(this.program, 'aTexCoord');
        const aAlpha = gl.getAttribLocation(this.program, 'aAlpha');
        const aDark = gl.getAttribLocation(this.program, 'aDarkness');
        
        gl.enableVertexAttribArray(aPos);
        gl.enableVertexAttribArray(aTex);
        gl.enableVertexAttribArray(aAlpha);
        gl.enableVertexAttribArray(aDark);
        
        const dpr = window.devicePixelRatio || 1;
        const FSIZE = 4;
        const STRIDE = 6 * FSIZE;
        
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, STRIDE, 0);
        gl.vertexAttribPointer(aTex, 2, gl.FLOAT, false, STRIDE, 2 * FSIZE);
        gl.vertexAttribPointer(aAlpha, 1, gl.FLOAT, false, STRIDE, 4 * FSIZE);
        gl.vertexAttribPointer(aDark, 1, gl.FLOAT, false, STRIDE, 5 * FSIZE);

        for (const [url, batchItems] of batches) {
            const tex = this.getTexture(url);
            if (!tex) continue;
            
            gl.bindTexture(gl.TEXTURE_2D, tex);
            
            this.quadCount = 0;
            let di = 0; // Data Index
            
            for (const item of batchItems) {
                const cx = (item.x - canvasRect.left) * dpr;
                const cy = (item.y - canvasRect.top) * dpr;
                const size = item.size * dpr;
                const radius = size * 0.5;
                const rot = item.rotation;
                const alpha = item.alpha !== undefined ? item.alpha : 1.0;
                
                const cos = Math.cos(rot);
                const sin = Math.sin(rot);
                
                const layers = this.LAYERS_PER_WHEEL;
                
                for (let i = 0; i < layers; i++) {
                    // Check buffer limit
                    if (this.quadCount >= this.maxQuads) {
                        // Flush
                        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.vertexData.subarray(0, di));
                        gl.drawArrays(gl.TRIANGLES, 0, this.quadCount * 6);
                        this.quadCount = 0;
                        di = 0;
                    }
                    
                    // Layer Params
                    // i=0 is bottom (furthest), i=layers-1 is top (closest)
                    // Shift layers 'up' (-Y) to simulate height.
                    const layerOffset = i * this.LAYER_DIST_PX * dpr;
                    
                    const offX = 0;
                    const offY = -layerOffset; 
                    
                    const x = cx + offX;
                    const y = cy + offY;
                    
                    // Darkness: Bottom layers darker
                    let darkness = (1.0 - (i / (layers - 1))) * 0.4;
                    // Side edge darkening
                    if (i > 0 && i < layers - 1) darkness += 0.1; 
                    
                    const hw = radius;
                    const hh = radius;
                    
                    const rCos = cos;
                    const rSin = sin;
                    
                    const pushVert = (px, py, u, v) => {
                        const rx = px * rCos - py * rSin;
                        const ry = px * rSin + py * rCos;
                        
                        this.vertexData[di++] = x + rx;
                        this.vertexData[di++] = y + ry;
                        this.vertexData[di++] = u;
                        this.vertexData[di++] = v;
                        this.vertexData[di++] = alpha;
                        this.vertexData[di++] = darkness;
                    };
                    
                    // Triangle 1
                    pushVert(-hw, -hh, 0, 0); // TL
                    pushVert( hw, -hh, 1, 0); // TR
                    pushVert(-hw,  hh, 0, 1); // BL
                    
                    // Triangle 2
                    pushVert(-hw,  hh, 0, 1); // BL
                    pushVert( hw, -hh, 1, 0); // TR
                    pushVert( hw,  hh, 1, 1); // BR
                    
                    this.quadCount++;
                }
            }
            
            if (this.quadCount > 0) {
                gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.vertexData.subarray(0, di));
                gl.drawArrays(gl.TRIANGLES, 0, this.quadCount * 6);
            }
        }
    }
}

export const waterwheelRenderer = new WaterwheelRenderer();