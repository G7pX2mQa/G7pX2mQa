import { VERTEX_SHADER, FRAGMENT_SHADER, WAVE_VERTEX_SHADER, WAVE_FRAGMENT_SHADER } from './waterShaders.js';

export class WaterSystem {
    constructor() {
        this.canvas = null;
        this.gl = null;
        this.program = null;
        this.waveProgram = null;
        
        this.waves = []; 
        this.width = 0;
        this.height = 0;
        this.quality = 1.0; 
        
        this.colors = {
            deep: [0.24, 0.70, 0.80],
            shallow: [0.30, 0.80, 0.85],
            foam: [0.95, 0.98, 1.0]
        };

        // FBO for wave rendering
        this.waveFBO = null;
        this.waveTexture = null;
        
        // Batching for waves
        this.MAX_WAVES = 2000;
        this.waveData = new Float32Array(this.MAX_WAVES * 6 * 5); // 6 verts * 5 floats
        this.waveBuffer = null;

        this.uniformLocations = {};
        this.waveUniforms = {};
    }

    init(canvasId) {
        const newCanvas = document.getElementById(canvasId);
        if (!newCanvas) {
            console.error('[WaterSystem] Canvas not found:', canvasId);
            return;
        }

        if (this.gl && this.canvas === newCanvas) {
            this.resize();
            return;
        }

        this.canvas = newCanvas;

        this.gl = this.canvas.getContext('webgl', { alpha: true, depth: false, antialias: false });
        if (!this.gl) {
            console.warn('[WaterSystem] WebGL not supported');
            return;
        }

        this.gl.enable(this.gl.BLEND);
        this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);

        this.createProgram();
        this.createBuffers();
        this.initFBO();
        this.resize();

        if (!this._boundResize) {
            this._boundResize = () => this.resize();
            window.addEventListener('resize', this._boundResize);
        }
    }

    createProgram() {
        const gl = this.gl;
        
        // --- Main Program ---
        const vs = this.compileShader(gl.VERTEX_SHADER, VERTEX_SHADER);
        const fs = this.compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);

        if (!vs || !fs) return;

        this.program = gl.createProgram();
        gl.attachShader(this.program, vs);
        gl.attachShader(this.program, fs);
        gl.linkProgram(this.program);

        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            console.error('[WaterSystem] Main Program link error:', gl.getProgramInfoLog(this.program));
            return;
        }

        this.uniformLocations = {
            uTime: gl.getUniformLocation(this.program, 'uTime'),
            uResolution: gl.getUniformLocation(this.program, 'uResolution'),
            uWaveMap: gl.getUniformLocation(this.program, 'uWaveMap'),
            uColorDeep: gl.getUniformLocation(this.program, 'uColorDeep'),
            uColorShallow: gl.getUniformLocation(this.program, 'uColorShallow'),
            uColorFoam: gl.getUniformLocation(this.program, 'uColorFoam'),
        };

        // --- Wave Sprite Program ---
        const wVs = this.compileShader(gl.VERTEX_SHADER, WAVE_VERTEX_SHADER);
        const wFs = this.compileShader(gl.FRAGMENT_SHADER, WAVE_FRAGMENT_SHADER);
        
        if (!wVs || !wFs) return;

        this.waveProgram = gl.createProgram();
        gl.attachShader(this.waveProgram, wVs);
        gl.attachShader(this.waveProgram, wFs);
        gl.linkProgram(this.waveProgram);
        
        if (!gl.getProgramParameter(this.waveProgram, gl.LINK_STATUS)) {
             console.error('[WaterSystem] Wave Program link error:', gl.getProgramInfoLog(this.waveProgram));
             return;
        }

        this.waveUniforms = {
            aPosition: gl.getAttribLocation(this.waveProgram, 'aPosition'),
            aUv: gl.getAttribLocation(this.waveProgram, 'aUv'),
            aAlpha: gl.getAttribLocation(this.waveProgram, 'aAlpha'),
        };
    }

    compileShader(type, source) {
        const gl = this.gl;
        const s = gl.createShader(type);
        gl.shaderSource(s, source);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            console.error('[WaterSystem] Shader compile error:', gl.getShaderInfoLog(s));
            gl.deleteShader(s);
            return null;
        }
        return s;
    }

    createBuffers() {
        const gl = this.gl;
        
        // Screen Quad Buffer (for Main Program)
        this.quadBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        const vertices = new Float32Array([
            -1, -1,
             1, -1,
            -1,  1,
             1,  1,
        ]);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

        // Wave Sprite Buffer (Dynamic)
        this.waveBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.waveBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this.waveData.byteLength, gl.DYNAMIC_DRAW);
    }

    initFBO() {
        const gl = this.gl;
        this.waveFBO = gl.createFramebuffer();
        this.waveTexture = gl.createTexture();
        
        gl.bindTexture(gl.TEXTURE_2D, this.waveTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        
        // Initial null size, will be resized in resize()
    }

    resize() {
        if (!this.canvas) return;
        const dpr = Math.min(window.devicePixelRatio, 2) * this.quality;
        const rect = this.canvas.getBoundingClientRect();
        
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        
        this.width = this.canvas.width;
        this.height = this.canvas.height;
        
        if (this.gl) {
            this.gl.viewport(0, 0, this.width, this.height);
            
            // Resize Wave FBO Texture
            if (this.waveTexture) {
                this.gl.bindTexture(this.gl.TEXTURE_2D, this.waveTexture);
                this.gl.texImage2D(
                    this.gl.TEXTURE_2D, 0, this.gl.RGBA, 
                    this.width, this.height, 0, 
                    this.gl.RGBA, this.gl.UNSIGNED_BYTE, null
                );
            }
        }
    }

    setQuality(q) {
        this.quality = q;
        this.resize();
    }

    addWave(x, y, size) {
        // x,y in CSS pixels (relative to canvas top-left usually)
        // size in CSS pixels
        this.waves.push({
            x, y,
            size, // Used for scaling
            life: 0,
            duration: 1.0 // Seconds
        });
    }

    update(dt) {
        for (let i = this.waves.length - 1; i >= 0; i--) {
            const w = this.waves[i];
            w.life += dt;
            if (w.life > w.duration) {
                // Remove fast
                this.waves[i] = this.waves[this.waves.length - 1];
                this.waves.pop();
            }
        }
    }

    render(totalTime) {
        if (!this.gl || !this.program || !this.waveProgram || this.width === 0 || this.height === 0) return;

        const gl = this.gl;
        
        // ----------------------------------------
        // 1. Render Waves to FBO
        // ----------------------------------------
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.waveFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.waveTexture, 0);
        gl.viewport(0, 0, this.width, this.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(this.waveProgram);
        
        // Populate Buffer
        let count = 0;
        const ptr = this.waveData;
        const cssWidth = this.width / (Math.min(window.devicePixelRatio, 2) * this.quality);
        const cssHeight = this.height / (Math.min(window.devicePixelRatio, 2) * this.quality);
        
        // Iterate waves
        const waveCount = Math.min(this.waves.length, this.MAX_WAVES);
        let offset = 0;
        
        for (let i = 0; i < waveCount; i++) {
            const w = this.waves[i];
            const progress = w.life / w.duration;
            const alpha = 1.0 - progress; // Fade out
            
            // Expansion
            const currentSize = w.size * (0.5 + 2.0 * progress);
            const r = currentSize * 0.5;
            
            // Coords in CSS pixels
            const l = w.x - r;
            const r_edge = w.x + r;
            const t = w.y - r;
            const b = w.y + r;
            
            // Normalize to NDC (-1 to 1)
            // Note: GL 0,0 is bottom-left usually, but DOM 0,0 is top-left.
            // We need to flip Y.
            
            const nL = (l / cssWidth) * 2 - 1;
            const nR = (r_edge / cssWidth) * 2 - 1;
            const nT = (1 - t / cssHeight) * 2 - 1; // Top in DOM is high Y? No, Top is 0. 1-(0)=1.
            const nB = (1 - b / cssHeight) * 2 - 1; // Bottom is high Y. 1-(1)=0.
            
            // Vertices: BL, BR, TL, TR (Triangle Strip or Triangles)
            // We'll use Triangles: BL, BR, TL, TL, BR, TR
            
            // BL
            ptr[offset++] = nL; ptr[offset++] = nB; // Pos
            ptr[offset++] = 0;  ptr[offset++] = 0;  // UV
            ptr[offset++] = alpha;
            
            // BR
            ptr[offset++] = nR; ptr[offset++] = nB;
            ptr[offset++] = 1;  ptr[offset++] = 0;
            ptr[offset++] = alpha;

            // TL
            ptr[offset++] = nL; ptr[offset++] = nT;
            ptr[offset++] = 0;  ptr[offset++] = 1;
            ptr[offset++] = alpha;
            
            // TL
            ptr[offset++] = nL; ptr[offset++] = nT;
            ptr[offset++] = 0;  ptr[offset++] = 1;
            ptr[offset++] = alpha;

            // BR
            ptr[offset++] = nR; ptr[offset++] = nB;
            ptr[offset++] = 1;  ptr[offset++] = 0;
            ptr[offset++] = alpha;

            // TR
            ptr[offset++] = nR; ptr[offset++] = nT;
            ptr[offset++] = 1;  ptr[offset++] = 1;
            ptr[offset++] = alpha;
            
            count++;
        }
        
        if (count > 0) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.waveBuffer);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.waveData.subarray(0, offset));
            
            gl.enableVertexAttribArray(this.waveUniforms.aPosition);
            gl.vertexAttribPointer(this.waveUniforms.aPosition, 2, gl.FLOAT, false, 20, 0);
            
            gl.enableVertexAttribArray(this.waveUniforms.aUv);
            gl.vertexAttribPointer(this.waveUniforms.aUv, 2, gl.FLOAT, false, 20, 8);
            
            gl.enableVertexAttribArray(this.waveUniforms.aAlpha);
            gl.vertexAttribPointer(this.waveUniforms.aAlpha, 1, gl.FLOAT, false, 20, 16);
            
            gl.drawArrays(gl.TRIANGLES, 0, count * 6);
        }
        
        // ----------------------------------------
        // 2. Render Main Water to Screen
        // ----------------------------------------
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.width, this.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(this.program);
        
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.waveTexture);
        gl.uniform1i(this.uniformLocations.uWaveMap, 0);

        gl.uniform1f(this.uniformLocations.uTime, totalTime);
        gl.uniform2f(this.uniformLocations.uResolution, this.width, this.height);
        gl.uniform3fv(this.uniformLocations.uColorDeep, this.colors.deep);
        gl.uniform3fv(this.uniformLocations.uColorShallow, this.colors.shallow);
        gl.uniform3fv(this.uniformLocations.uColorFoam, this.colors.foam);
        
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        const posLoc = gl.getAttribLocation(this.program, 'position');
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
        
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
}

export const waterSystem = new WaterSystem();
