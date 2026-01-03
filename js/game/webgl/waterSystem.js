import { VERTEX_SHADER, FRAGMENT_SHADER, WAVE_VERTEX_SHADER, WAVE_BRUSH_FRAGMENT_SHADER, SIMULATION_FRAGMENT_SHADER, BACKGROUND_FRAGMENT_SHADER } from './waterShaders.js';

export class WaterSystem {
    constructor() {
        // Canvases
        this.canvasBack = null;
        this.canvasFront = null;
        
        // Contexts
        this.glBack = null;
        this.glFront = null;
        
        // Programs
        this.programBack = null;   // Background Water Body
        this.programFront = null;  // Foreground Waves
        this.brushProgram = null;  // For Simulation (Front context)
        this.simProgram = null;    // For Simulation (Front context)
        
        this.width = 0;
        this.height = 0;
        this.quality = 0.5; // Lower resolution for fluid sim is usually fine/better
        
        this.colors = {
            deep: [0.0, 0.2, 0.4],
            shallow: [0.30, 0.80, 0.85],
            foam: [0.95, 0.98, 1.0]
        };

        // Ping-Pong FBOs (Only needed for the simulation/front context)
        this.fboRead = null;
        this.fboWrite = null;
        this.texRead = null;
        this.texWrite = null;
        
        // Batching for new waves (stamped this frame)
        this.MAX_NEW_WAVES = 500;
        this.waveData = new Float32Array(this.MAX_NEW_WAVES * 6 * 5); // 6 verts * 5 floats
        this.waveBuffer = null; // Bound in Front Context
        this.newWaves = []; // {x, y, size}

        this.quadBufferBack = null; // For Back Context
        this.quadBufferFront = null; // For Front Context
    }

    init(backCanvasId, frontCanvasId) {
        const cBack = document.getElementById(backCanvasId);
        const cFront = document.getElementById(frontCanvasId);
        
        if (!cBack || !cFront) return;

        // If already initialized with these canvases, just resize
        if (this.glBack && this.glFront && this.canvasBack === cBack && this.canvasFront === cFront) {
            this.resize();
            return;
        }

        this.canvasBack = cBack;
        this.canvasFront = cFront;

        // Create Contexts
        this.glBack = this.canvasBack.getContext('webgl', { alpha: true, depth: false, antialias: false });
        this.glFront = this.canvasFront.getContext('webgl', { alpha: true, depth: false, antialias: false });
        
        if (!this.glBack || !this.glFront) {
            console.warn('[WaterSystem] WebGL not supported');
            return;
        }

        this.glBack.enable(this.glBack.BLEND);
        this.glFront.enable(this.glFront.BLEND);

        this.createPrograms();
        this.createBuffers();
        this.initFBOs(); // Front context only
        this.resize();

        if (!this._boundResize) {
            this._boundResize = () => this.resize();
            window.addEventListener('resize', this._boundResize);
        }
    }

    createPrograms() {
        // --- Front Context Programs (Simulation + Wave Render) ---
        const glF = this.glFront;
        
        // 1. Main Display Program (Wave Overlay)
        this.programFront = this.createProgramObj(glF, VERTEX_SHADER, FRAGMENT_SHADER);
        if (this.programFront) {
            this.frontUniforms = {
                uTime: glF.getUniformLocation(this.programFront, 'uTime'),
                uResolution: glF.getUniformLocation(this.programFront, 'uResolution'),
                uWaveMap: glF.getUniformLocation(this.programFront, 'uWaveMap'),
                uColorDeep: glF.getUniformLocation(this.programFront, 'uColorDeep'),
                uColorShallow: glF.getUniformLocation(this.programFront, 'uColorShallow'),
                uColorFoam: glF.getUniformLocation(this.programFront, 'uColorFoam'),
            };
        }

        // 2. Brush Program (Stamps new waves)
        this.brushProgram = this.createProgramObj(glF, WAVE_VERTEX_SHADER, WAVE_BRUSH_FRAGMENT_SHADER);
        if (this.brushProgram) {
            this.brushUniforms = {
                aPosition: glF.getAttribLocation(this.brushProgram, 'aPosition'),
                aUv: glF.getAttribLocation(this.brushProgram, 'aUv'),
                aAlpha: glF.getAttribLocation(this.brushProgram, 'aAlpha'),
            };
        }

        // 3. Simulation Program (Decay & Flow)
        this.simProgram = this.createProgramObj(glF, VERTEX_SHADER, SIMULATION_FRAGMENT_SHADER);
        if (this.simProgram) {
            this.simUniforms = {
                uLastFrame: glF.getUniformLocation(this.simProgram, 'uLastFrame'),
                uResolution: glF.getUniformLocation(this.simProgram, 'uResolution'),
                uDt: glF.getUniformLocation(this.simProgram, 'uDt'),
            };
        }

        // --- Back Context Programs (Water Body) ---
        const glB = this.glBack;
        
        this.programBack = this.createProgramObj(glB, VERTEX_SHADER, BACKGROUND_FRAGMENT_SHADER);
        if (this.programBack) {
            this.backUniforms = {
                uTime: glB.getUniformLocation(this.programBack, 'uTime'),
                uResolution: glB.getUniformLocation(this.programBack, 'uResolution'),
                uColorDeep: glB.getUniformLocation(this.programBack, 'uColorDeep'),
                uColorShallow: glB.getUniformLocation(this.programBack, 'uColorShallow'),
            };
        }
    }

    createProgramObj(gl, vsSource, fsSource) {
        if (!vsSource || !fsSource) return null;
        
        const vs = this.compileShader(gl, gl.VERTEX_SHADER, vsSource);
        const fs = this.compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
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

    compileShader(gl, type, source) {
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
        const vertices = new Float32Array([
            -1, -1,
             1, -1,
            -1,  1,
             1,  1,
        ]);

        // Front Quad
        const glF = this.glFront;
        this.quadBufferFront = glF.createBuffer();
        glF.bindBuffer(glF.ARRAY_BUFFER, this.quadBufferFront);
        glF.bufferData(glF.ARRAY_BUFFER, vertices, glF.STATIC_DRAW);

        // Front Wave Batch Buffer
        this.waveBuffer = glF.createBuffer();
        glF.bindBuffer(glF.ARRAY_BUFFER, this.waveBuffer);
        glF.bufferData(glF.ARRAY_BUFFER, this.waveData.byteLength, glF.DYNAMIC_DRAW);

        // Back Quad
        const glB = this.glBack;
        this.quadBufferBack = glB.createBuffer();
        glB.bindBuffer(glB.ARRAY_BUFFER, this.quadBufferBack);
        glB.bufferData(glB.ARRAY_BUFFER, vertices, glB.STATIC_DRAW);
    }

    initFBOs() {
        const gl = this.glFront; // Only front uses simulation
        
        this.texRead = this.createTexture(gl);
        this.fboRead = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboRead);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texRead, 0);

        this.texWrite = this.createTexture(gl);
        this.fboWrite = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboWrite);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texWrite, 0);
        
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    createTexture(gl) {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        return tex;
    }

    resize() {
        if (!this.canvasFront || !this.canvasBack) return;
        
        const dpr = Math.min(window.devicePixelRatio, 2) * this.quality;
        const rect = this.canvasFront.getBoundingClientRect(); // Both should be same size
        
        if (rect.width === 0 || rect.height === 0) return;

        const w = rect.width * dpr;
        const h = rect.height * dpr;
        
        this.canvasFront.width = w;
        this.canvasFront.height = h;
        this.canvasBack.width = w;
        this.canvasBack.height = h;

        this.width = w;
        this.height = h;
        
        // Resize Front
        if (this.glFront) {
            this.glFront.viewport(0, 0, this.width, this.height);
            this.resizeTexture(this.glFront, this.texRead);
            this.resizeTexture(this.glFront, this.texWrite);
            
            this.glFront.bindFramebuffer(this.glFront.FRAMEBUFFER, this.fboRead);
            this.glFront.clear(this.glFront.COLOR_BUFFER_BIT);
            this.glFront.bindFramebuffer(this.glFront.FRAMEBUFFER, this.fboWrite);
            this.glFront.clear(this.glFront.COLOR_BUFFER_BIT);
            this.glFront.bindFramebuffer(this.glFront.FRAMEBUFFER, null);
        }

        // Resize Back
        if (this.glBack) {
            this.glBack.viewport(0, 0, this.width, this.height);
        }
    }
    
    resizeTexture(gl, tex) {
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
        if (this.newWaves.length < this.MAX_NEW_WAVES) {
            this.newWaves.push({ x, y, size: size * 1.5 });
        }
    }

    update(dt) {
        // Simulation logic happens in render pass via shaders
    }

    render(totalTime) {
        if (this.width === 0 || this.height === 0) return;
        
        this.renderBackground(totalTime);
        this.renderForeground(totalTime);
    }

    renderBackground(totalTime) {
        if (!this.glBack || !this.programBack) return;
        const gl = this.glBack;

        gl.viewport(0, 0, this.width, this.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        
        gl.useProgram(this.programBack);
        
        gl.uniform1f(this.backUniforms.uTime, totalTime);
        gl.uniform2f(this.backUniforms.uResolution, this.width, this.height);
        gl.uniform3fv(this.backUniforms.uColorDeep, this.colors.deep);
        gl.uniform3fv(this.backUniforms.uColorShallow, this.colors.shallow);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBufferBack);
        const posLoc = gl.getAttribLocation(this.programBack, 'position');
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
        
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    renderForeground(totalTime) {
        if (!this.glFront || !this.mainProgram && !this.programFront) return;
        const gl = this.glFront;
        const program = this.programFront;

        // 1. Simulation (Sim Shader)
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboWrite);
        gl.viewport(0, 0, this.width, this.height);
        gl.disable(gl.BLEND);
        
        gl.useProgram(this.simProgram);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texRead);
        gl.uniform1i(this.simUniforms.uLastFrame, 0);
        gl.uniform2f(this.simUniforms.uResolution, this.width, this.height);
        gl.uniform1f(this.simUniforms.uDt, 0.016); 

        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBufferFront);
        const posLocSim = gl.getAttribLocation(this.simProgram, 'position');
        gl.enableVertexAttribArray(posLocSim);
        gl.vertexAttribPointer(posLocSim, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        // 2. Stamp New Waves (Brush Shader)
        if (this.newWaves.length > 0) {
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE);
            gl.useProgram(this.brushProgram);
            
            let count = 0;
            const ptr = this.waveData;
            const cssWidth = this.width / (Math.min(window.devicePixelRatio, 2) * this.quality);
            const cssHeight = this.height / (Math.min(window.devicePixelRatio, 2) * this.quality);
            
            for (let i = 0; i < this.newWaves.length; i++) {
                const w = this.newWaves[i];
                const r = w.size * 0.8; 
                const widthStretch = 2.5;

                const l = w.x - r * widthStretch;
                const r_edge = w.x + r * widthStretch;
                const t = w.y - r;
                const b = w.y + r;
                
                const nL = (l / cssWidth) * 2 - 1;
                const nR = (r_edge / cssWidth) * 2 - 1;
                const nT = (1 - t / cssHeight) * 2 - 1;
                const nB = (1 - b / cssHeight) * 2 - 1;
                
                const alpha = 1.0;
                let offset = count * 30; 

                // BL
                ptr[offset++] = nL; ptr[offset++] = nB; ptr[offset++] = 0;  ptr[offset++] = 0; ptr[offset++] = alpha;
                // BR
                ptr[offset++] = nR; ptr[offset++] = nB; ptr[offset++] = 1;  ptr[offset++] = 0; ptr[offset++] = alpha;
                // TL
                ptr[offset++] = nL; ptr[offset++] = nT; ptr[offset++] = 0;  ptr[offset++] = 1; ptr[offset++] = alpha;
                // TL
                ptr[offset++] = nL; ptr[offset++] = nT; ptr[offset++] = 0;  ptr[offset++] = 1; ptr[offset++] = alpha;
                // BR
                ptr[offset++] = nR; ptr[offset++] = nB; ptr[offset++] = 1;  ptr[offset++] = 0; ptr[offset++] = alpha;
                // TR
                ptr[offset++] = nR; ptr[offset++] = nT; ptr[offset++] = 1;  ptr[offset++] = 1; ptr[offset++] = alpha;
                
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
            this.newWaves.length = 0;
        }

        // 3. Final Output (Main Shader)
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.width, this.height);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texWrite);
        gl.uniform1i(this.frontUniforms.uWaveMap, 0);
        gl.uniform1f(this.frontUniforms.uTime, totalTime);
        gl.uniform2f(this.frontUniforms.uResolution, this.width, this.height);
        gl.uniform3fv(this.frontUniforms.uColorDeep, this.colors.deep);
        gl.uniform3fv(this.frontUniforms.uColorShallow, this.colors.shallow);
        gl.uniform3fv(this.frontUniforms.uColorFoam, this.colors.foam);
        
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBufferFront);
        const posLocMain = gl.getAttribLocation(program, 'position');
        gl.enableVertexAttribArray(posLocMain);
        gl.vertexAttribPointer(posLocMain, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        // Swap Ping-Pong
        const tempT = this.texRead; this.texRead = this.texWrite; this.texWrite = tempT;
        const tempF = this.fboRead; this.fboRead = this.fboWrite; this.fboWrite = tempF;
    }
}

export const waterSystem = new WaterSystem();
