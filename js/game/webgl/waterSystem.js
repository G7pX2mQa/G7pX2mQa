import { VERTEX_SHADER, FRAGMENT_SHADER, WAVE_VERTEX_SHADER, WAVE_BRUSH_FRAGMENT_SHADER, SIMULATION_FRAGMENT_SHADER } from './waterShaders.js';

export class WaterSystem {
    constructor() {
        this.canvas = null;
        this.gl = null;
        
        // Programs
        this.mainProgram = null;
        this.brushProgram = null;
        this.simProgram = null;
        
        this.width = 0;
        this.height = 0;
        this.quality = 0.5; // Lower resolution for fluid sim is usually fine/better
        
        this.colors = {
            deep: [0.24, 0.70, 0.80],
            shallow: [0.30, 0.80, 0.85],
            foam: [0.95, 0.98, 1.0]
        };

        // Ping-Pong FBOs
        this.fboRead = null;
        this.fboWrite = null;
        this.texRead = null;
        this.texWrite = null;
        
        // Batching for new waves (stamped this frame)
        // We still need a buffer to draw the quads for the *new* waves
        this.MAX_NEW_WAVES = 500; // Per frame limit, effectively infinite over time
        this.waveData = new Float32Array(this.MAX_NEW_WAVES * 6 * 5); // 6 verts * 5 floats
        this.waveBuffer = null;
        this.newWaves = []; // {x, y, size}

        this.quadBuffer = null; // Full screen quad
    }

    init(canvasId) {
        const newCanvas = document.getElementById(canvasId);
        if (!newCanvas) {
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

        // Enable extensions if needed (OES_texture_float for better precision? 
        // Standard byte texture is usually enough for visual waves)
        
        this.gl.enable(this.gl.BLEND);
        // We use different blend modes for different passes

        this.createPrograms();
        this.createBuffers();
        this.initFBOs();
        this.resize();

        if (!this._boundResize) {
            this._boundResize = () => this.resize();
            window.addEventListener('resize', this._boundResize);
        }
    }

    createPrograms() {
        const gl = this.gl;
        
        // 1. Main Display Program
        this.mainProgram = this.createProgramObj(VERTEX_SHADER, FRAGMENT_SHADER);
        if (this.mainProgram) {
            this.mainUniforms = {
                uTime: gl.getUniformLocation(this.mainProgram, 'uTime'),
                uResolution: gl.getUniformLocation(this.mainProgram, 'uResolution'),
                uWaveMap: gl.getUniformLocation(this.mainProgram, 'uWaveMap'),
                uColorDeep: gl.getUniformLocation(this.mainProgram, 'uColorDeep'),
                uColorShallow: gl.getUniformLocation(this.mainProgram, 'uColorShallow'),
                uColorFoam: gl.getUniformLocation(this.mainProgram, 'uColorFoam'),
            };
        }

        // 2. Brush Program (Stamps new waves)
        this.brushProgram = this.createProgramObj(WAVE_VERTEX_SHADER, WAVE_BRUSH_FRAGMENT_SHADER);
        if (this.brushProgram) {
            this.brushUniforms = {
                aPosition: gl.getAttribLocation(this.brushProgram, 'aPosition'),
                aUv: gl.getAttribLocation(this.brushProgram, 'aUv'),
                aAlpha: gl.getAttribLocation(this.brushProgram, 'aAlpha'),
            };
        }

        // 3. Simulation Program (Decay & Flow)
        this.simProgram = this.createProgramObj(VERTEX_SHADER, SIMULATION_FRAGMENT_SHADER);
        if (this.simProgram) {
            this.simUniforms = {
                uLastFrame: gl.getUniformLocation(this.simProgram, 'uLastFrame'),
                uResolution: gl.getUniformLocation(this.simProgram, 'uResolution'),
                uDt: gl.getUniformLocation(this.simProgram, 'uDt'),
            };
        }
    }

    createProgramObj(vsSource, fsSource) {
        const gl = this.gl;
        if (!vsSource || !fsSource) {
            console.error("Missing source!", { vsLen: vsSource?.length, fsLen: fsSource?.length });
            return null;
        }
        const vs = this.compileShader(gl.VERTEX_SHADER, vsSource);
        const fs = this.compileShader(gl.FRAGMENT_SHADER, fsSource);
        if (!vs || !fs) return null;
        
        const prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            console.error('[WaterSystem] Link error:', gl.getProgramInfoLog(prog));
            return null;
        }
        return prog;
    }

    compileShader(type, source) {
        const gl = this.gl;
        const s = gl.createShader(type);
        gl.shaderSource(s, source);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            console.error('[WaterSystem] Shader compile error:', gl.getShaderInfoLog(s));
            console.log('Source type:', typeof source);
            try {
                if (source) console.log('Source start:', source.substring(0, 100));
            } catch(e) { console.error("Log failed", e); }
            gl.deleteShader(s);
            return null;
        }
        return s;
    }

    createBuffers() {
        const gl = this.gl;
        
        // Full Screen Quad
        this.quadBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        const vertices = new Float32Array([
            -1, -1,
             1, -1,
            -1,  1,
             1,  1,
        ]);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

        // Wave Batch Buffer (Dynamic)
        this.waveBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.waveBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this.waveData.byteLength, gl.DYNAMIC_DRAW);
    }

    initFBOs() {
        const gl = this.gl;
        
        // Create 2 textures and 2 FBOs
        this.texRead = this.createTexture();
        this.fboRead = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboRead);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texRead, 0);

        this.texWrite = this.createTexture();
        this.fboWrite = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboWrite);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texWrite, 0);
        
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    createTexture() {
        const gl = this.gl;
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        // Initialize with dummy data to avoid incomplete framebuffer
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        return tex;
    }

    resize() {
        if (!this.canvas) return;
        const dpr = Math.min(window.devicePixelRatio, 2) * this.quality;
        const rect = this.canvas.getBoundingClientRect();
        
        if (rect.width === 0 || rect.height === 0) return;

        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        
        this.width = this.canvas.width;
        this.height = this.canvas.height;
        
        if (this.gl) {
            this.gl.viewport(0, 0, this.width, this.height);
            
            // Resize Textures
            this.resizeTexture(this.texRead);
            this.resizeTexture(this.texWrite);
            
            // Clear FBOs
            this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.fboRead);
            this.gl.clear(this.gl.COLOR_BUFFER_BIT);
            
            this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.fboWrite);
            this.gl.clear(this.gl.COLOR_BUFFER_BIT);
            
            this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
        }
    }
    
    resizeTexture(tex) {
        const gl = this.gl;
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(
            gl.TEXTURE_2D, 0, gl.RGBA, 
            this.width, this.height, 0, 
            gl.RGBA, gl.UNSIGNED_BYTE, null
        );
    }

    setQuality(q) {
        this.quality = q;
        this.resize();
    }

    addWave(x, y, size) {
        // Just push to batch for this frame
        if (this.newWaves.length < this.MAX_NEW_WAVES) {
            // Slightly larger scale for better visual impact
            this.newWaves.push({ x, y, size: size * 1.5 });
        }
    }

    update(dt) {
        // No logic needed here for individual waves
    }

    render(totalTime) {
        if (!this.gl || !this.mainProgram || this.width === 0 || this.height === 0) return;

        const gl = this.gl;
        
        // -----------------------------------------------------
        // Pass 1: Simulation (Decay & Flow)
        // Read -> Write
        // -----------------------------------------------------
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboWrite);
        gl.viewport(0, 0, this.width, this.height);
        
        // Disable blending for simulation (we want to overwrite pixels with decayed version)
        gl.disable(gl.BLEND);
        
        gl.useProgram(this.simProgram);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texRead);
        gl.uniform1i(this.simUniforms.uLastFrame, 0);
        gl.uniform2f(this.simUniforms.uResolution, this.width, this.height);
        gl.uniform1f(this.simUniforms.uDt, 0.016); // Fixed dt approximation

        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        const posLocSim = gl.getAttribLocation(this.simProgram, 'position');
        gl.enableVertexAttribArray(posLocSim);
        gl.vertexAttribPointer(posLocSim, 2, gl.FLOAT, false, 0, 0);
        
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        // -----------------------------------------------------
        // Pass 2: Stamp New Waves
        // Draw directly into Write FBO on top of simulation
        // -----------------------------------------------------
        if (this.newWaves.length > 0) {
            gl.enable(gl.BLEND);
            // Additive blending for waves
            gl.blendFunc(gl.ONE, gl.ONE);
            
            gl.useProgram(this.brushProgram);
            
            // Build Buffer
            let count = 0;
            const ptr = this.waveData;
            const cssWidth = this.width / (Math.min(window.devicePixelRatio, 2) * this.quality);
            const cssHeight = this.height / (Math.min(window.devicePixelRatio, 2) * this.quality);
            
            for (let i = 0; i < this.newWaves.length; i++) {
                const w = this.newWaves[i];
                
                // Size: Use input size, maybe scale slightly
                const r = w.size * 0.8; 
                
                // Stretch width to make waves look wider (horizontal aspect ratio)
                const widthStretch = 2.5;

                // Coords
                const l = w.x - r * widthStretch;
                const r_edge = w.x + r * widthStretch;
                const t = w.y - r;
                const b = w.y + r;
                
                const nL = (l / cssWidth) * 2 - 1;
                const nR = (r_edge / cssWidth) * 2 - 1;
                const nT = (1 - t / cssHeight) * 2 - 1;
                const nB = (1 - b / cssHeight) * 2 - 1;
                
                // Alpha 1.0
                const alpha = 1.0;
                let offset = count * 30; // 6 verts * 5 floats

                // BL
                ptr[offset++] = nL; ptr[offset++] = nB; 
                ptr[offset++] = 0;  ptr[offset++] = 0;
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
            
            gl.bindBuffer(gl.ARRAY_BUFFER, this.waveBuffer);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.waveData.subarray(0, count * 30));
            
            gl.enableVertexAttribArray(this.brushUniforms.aPosition);
            gl.vertexAttribPointer(this.brushUniforms.aPosition, 2, gl.FLOAT, false, 20, 0);
            
            gl.enableVertexAttribArray(this.brushUniforms.aUv);
            gl.vertexAttribPointer(this.brushUniforms.aUv, 2, gl.FLOAT, false, 20, 8);
            
            gl.enableVertexAttribArray(this.brushUniforms.aAlpha);
            gl.vertexAttribPointer(this.brushUniforms.aAlpha, 1, gl.FLOAT, false, 20, 16);
            
            gl.drawArrays(gl.TRIANGLES, 0, count * 6);
            
            // Clear batch
            this.newWaves.length = 0;
        }
        
        // -----------------------------------------------------
        // Pass 3: Display to Screen
        // Use Write Texture as Map
        // -----------------------------------------------------
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.width, this.height);
        
        // Normal blending for screen output
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        // Clear is optional if we draw full screen quad opacity 1.0, 
        // but safe to clear
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(this.mainProgram);
        
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texWrite);
        gl.uniform1i(this.mainUniforms.uWaveMap, 0);

        gl.uniform1f(this.mainUniforms.uTime, totalTime);
        gl.uniform2f(this.mainUniforms.uResolution, this.width, this.height);
        gl.uniform3fv(this.mainUniforms.uColorDeep, this.colors.deep);
        gl.uniform3fv(this.mainUniforms.uColorShallow, this.colors.shallow);
        gl.uniform3fv(this.mainUniforms.uColorFoam, this.colors.foam);
        
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        const posLocMain = gl.getAttribLocation(this.mainProgram, 'position');
        gl.enableVertexAttribArray(posLocMain);
        gl.vertexAttribPointer(posLocMain, 2, gl.FLOAT, false, 0, 0);
        
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        
        // -----------------------------------------------------
        // Swap Ping-Pong
        // -----------------------------------------------------
        const tempT = this.texRead;
        this.texRead = this.texWrite;
        this.texWrite = tempT;
        
        const tempF = this.fboRead;
        this.fboRead = this.fboWrite;
        this.fboWrite = tempF;
    }
}

export const waterSystem = new WaterSystem();
