import {
    VERTEX_SHADER,
    BACKGROUND_FRAGMENT_SHADER,
    FRAGMENT_SHADER,
    WAVE_VERTEX_SHADER,
    WAVE_BRUSH_FRAGMENT_SHADER,
    SIMULATION_FRAGMENT_SHADER
} from './waterShaders.js';

// --- Colors Extracted from Legacy 2D System ---
const COLOR_DEEP = [0.2, 0.5, 0.9];          // Deep Royal Blue
const COLOR_SHALLOW = [0.2, 0.9, 1.0];       // Bright Turquoise
// Updated to Vivid Oceanic Blue Gradient
const COLOR_WAVE = [0.9, 0.95, 1.0];         // White Foam (Highlights)
const COLOR_WAVE_DEEP = [0.2, 0.5, 0.9];     // Deep Blue (Matches Background Deep)

function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader);
        console.error('Shader compile error:', log);
        console.error('Source start:', source.substring(0, 100));
        gl.deleteShader(shader);
        throw new Error('Shader compile error: ' + log);
    }
    return shader;
}

function createProgram(gl, vsSource, fsSource) {
    const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
    if (!vs || !fs) return null;

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(program);
        console.error('Program link error:', log);
        throw new Error('Program link error: ' + log);
    }
    return program;
}

export class WaterSystem {
    constructor() {
        this.bgCanvas = null;
        this.glBg = null;

        // Array to hold multiple foreground layers
        this.fgLayers = []; 
        /* Each layer object: {
             canvas: HTMLCanvasElement,
             gl: WebGLRenderingContext,
             program: WebGLProgram,
             simProgram: WebGLProgram,
             brushProgram: WebGLProgram,
             quadBuffer: WebGLBuffer,
             brushBuffer: WebGLBuffer,
             readFBO: WebGLFramebuffer,
             writeFBO: WebGLFramebuffer,
             readTexture: WebGLTexture,
             writeTexture: WebGLTexture
           }
        */

        // Background Context Programs
        this.bgProgram = null;
        this.bgSimProgram = null;
        this.bgBrushProgram = null;

        this.width = 0;
        this.height = 0;
        
        // Simulation State
        this.simRes = 512;
        
        // BG Sim
        this.bgReadFBO = null;
        this.bgWriteFBO = null;
        this.bgReadTexture = null;
        this.bgWriteTexture = null;

        // Buffers
        this.quadBufferBg = null;
        this.bgBrushBuffer = null;

        this._boundResize = null;
    }

    init(backCanvasId, frontCanvasIds) {
        this.fgLayers = [];
        this.bgCanvas = document.getElementById(backCanvasId);
        
        // Handle array of foreground canvases
        const ids = Array.isArray(frontCanvasIds) ? frontCanvasIds : [frontCanvasIds];
        
        if (!this.bgCanvas) return;

        // Initialize Background Context
        this.glBg = this.bgCanvas.getContext('webgl', { alpha: true, depth: false }) || 
                    this.bgCanvas.getContext('experimental-webgl');

        if (!this.glBg) {
            console.error('WaterSystem: WebGL not supported for BG');
            return;
        }

        this.initBgShaders();
        this.initBgBuffers();
        this.initBgSimulation();

        // Initialize Foreground Layers
        ids.forEach(id => {
            const canvas = document.getElementById(id);
            if (!canvas) return;
            
            canvas.style.display = 'block';
            
            const gl = canvas.getContext('webgl', { alpha: true, depth: false }) || 
                       canvas.getContext('experimental-webgl');
            
            if (!gl) {
                console.error(`WaterSystem: WebGL not supported for layer ${id}`);
                return;
            }

            const layer = {
                canvas: canvas,
                gl: gl,
                program: createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER),
                simProgram: createProgram(gl, VERTEX_SHADER, SIMULATION_FRAGMENT_SHADER),
                brushProgram: createProgram(gl, WAVE_VERTEX_SHADER, WAVE_BRUSH_FRAGMENT_SHADER),
                quadBuffer: null,
                brushBuffer: null,
                readFBO: null,
                writeFBO: null,
                readTexture: null,
                writeTexture: null
            };

            // Init Buffers for this layer
            const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
            layer.quadBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, layer.quadBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
            
            layer.brushBuffer = gl.createBuffer();

            // Init Sim for this layer
            const simRes = this.createSimResources(gl);
            layer.readFBO = simRes.readFBO;
            layer.writeFBO = simRes.writeFBO;
            layer.readTexture = simRes.readTex;
            layer.writeTexture = simRes.writeTex;

            this.fgLayers.push(layer);
        });

        this.resize();
        
        if (!this._boundResize) {
            this._boundResize = () => this.resize();
            window.addEventListener('resize', this._boundResize);
        }
    }

    initBgShaders() {
        this.bgProgram = createProgram(this.glBg, VERTEX_SHADER, BACKGROUND_FRAGMENT_SHADER);
        this.bgSimProgram = createProgram(this.glBg, VERTEX_SHADER, SIMULATION_FRAGMENT_SHADER);
        this.bgBrushProgram = createProgram(this.glBg, WAVE_VERTEX_SHADER, WAVE_BRUSH_FRAGMENT_SHADER);
    }

    initBgBuffers() {
        const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
        const glBg = this.glBg;
        this.quadBufferBg = glBg.createBuffer();
        glBg.bindBuffer(glBg.ARRAY_BUFFER, this.quadBufferBg);
        glBg.bufferData(glBg.ARRAY_BUFFER, vertices, glBg.STATIC_DRAW);
        this.bgBrushBuffer = glBg.createBuffer();
    }

    initBgSimulation() {
        const bgRes = this.createSimResources(this.glBg);
        this.bgReadFBO = bgRes.readFBO;
        this.bgWriteFBO = bgRes.writeFBO;
        this.bgReadTexture = bgRes.readTex;
        this.bgWriteTexture = bgRes.writeTex;
    }

    createSimResources(gl) {
        const w = this.simRes;
        const h = this.simRes;

        gl.getExtension('OES_texture_float');
        gl.getExtension('OES_texture_float_linear');

        const createTex = () => {
            const tex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.FLOAT, null);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            return tex;
        };

        const readTex = createTex();
        const writeTex = createTex();

        const readFBO = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, readFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, readTex, 0);

        const writeFBO = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, writeFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, writeTex, 0);
        
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        
        return { readFBO, writeFBO, readTex, writeTex };
    }

    resize() {
        const dpr = window.devicePixelRatio || 1;

        if (this.bgCanvas && this.glBg) {
            const rect = this.bgCanvas.getBoundingClientRect();
            this.bgCanvas.width = rect.width * dpr;
            this.bgCanvas.height = rect.height * dpr;
            this.glBg.viewport(0, 0, this.bgCanvas.width, this.bgCanvas.height);
        }

        // Resize all foreground layers
        if (this.fgLayers.length > 0) {
            const rect = this.fgLayers[0].canvas.getBoundingClientRect(); // Assume all same size
            this.width = rect.width;
            this.height = rect.height;
            
            this.fgLayers.forEach(layer => {
                 const rect = layer.canvas.getBoundingClientRect();
                 layer.canvas.width = rect.width * dpr;
                 layer.canvas.height = rect.height * dpr;
                 layer.gl.viewport(0, 0, layer.canvas.width, layer.canvas.height);
            });
        }
    }

    applyBrush(gl, program, buffer, fbo, x, y, size) {
        gl.useProgram(program);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.viewport(0, 0, this.simRes, this.simRes);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);

        // Map pixels to WebGL Clip Space
        const brushSize = Math.max(0.05, size / this.width) * 15.0; 
        
        const ndcX = (x / this.width) * 2 - 1;
        const ndcY = -((y / this.height) * 2 - 1); // Flip Y for WebGL

        const s = brushSize;
        const aspect = (this.width && this.height) ? (this.width / this.height) : 1.0;

        // Counter-scale width in simulation to ensure circular shape on screen
        const shapeScale = 1.2; 
        const wX = (s * shapeScale * 2.0) / aspect; 
        const wY = s * shapeScale * 1.25;
        
        // Quad vertices: x, y, u, v, alpha
        const data = new Float32Array([
            ndcX - wX, ndcY - wY, 0, 0, 1,
            ndcX + wX, ndcY - wY, 1, 0, 1,
            ndcX - wX, ndcY + wY, 0, 1, 1,
            ndcX + wX, ndcY + wY, 1, 1, 1
        ]);

        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);

        const aPos = gl.getAttribLocation(program, 'aPosition');
        const aUv = gl.getAttribLocation(program, 'aUv');
        const aAlpha = gl.getAttribLocation(program, 'aAlpha');

        // Stride = 5 floats * 4 bytes = 20
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 20, 0);

        gl.enableVertexAttribArray(aUv);
        gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 20, 8);

        gl.enableVertexAttribArray(aAlpha);
        gl.vertexAttribPointer(aAlpha, 1, gl.FLOAT, false, 20, 16);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        gl.disable(gl.BLEND);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    addWave(x, y, size) {
        if (!this.glBg || this.fgLayers.length === 0) return;

        // 1. Apply to BG Sim (Always, for water distortion)
        this.applyBrush(
            this.glBg, 
            this.bgBrushProgram, 
            this.bgBrushBuffer, 
            this.bgReadFBO, 
            x, y, size
        );

        // 2. Apply to ONE Random FG Layer (To distribute density)
        const layerIdx = Math.floor(Math.random() * this.fgLayers.length);
        const layer = this.fgLayers[layerIdx];
        
        this.applyBrush(
            layer.gl, 
            layer.brushProgram, 
            layer.brushBuffer, 
            layer.readFBO, 
            x, y, size
        );
    }

    runSimStep(gl, program, quadBuffer, readFBO, writeFBO, readTex, writeTex) {
        gl.useProgram(program);
        gl.viewport(0, 0, this.simRes, this.simRes);
        
        // Write to WriteFBO
        gl.bindFramebuffer(gl.FRAMEBUFFER, writeFBO);
        
        // Read from ReadTexture
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, readTex);
        gl.uniform1i(gl.getUniformLocation(program, 'uLastFrame'), 0);
        gl.uniform2f(gl.getUniformLocation(program, 'uResolution'), this.simRes, this.simRes);
        gl.uniform1f(gl.getUniformLocation(program, 'uDt'), 0.016); // Fixed timestep

        // Draw Full Screen Quad
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
        const aPos = gl.getAttribLocation(program, 'position');
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
        
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        
        // Return swapped state
        return {
            readFBO: writeFBO,
            writeFBO: readFBO,
            readTex: writeTex,
            writeTex: readTex
        };
    }

    update(dt) {
        // "Natural Swell" Auto Spawning Logic - DISABLED
    }

    spawnRandomWave() {
        if (!this.width) return;
        
        // Random X Position (0 to Width)
        const x = Math.random() * this.width;
        
        // Spawn at the top
        const y = 0; 
        
        // Size: 30% to 50% of screen width (Bolder, stronger waves)
        const sizePct = 0.3 + Math.random() * 0.2;
        const size = this.width * sizePct;
        
        this.addWave(x, y, size);
    }

    render(totalTime) {
        if (!this.glBg) return;
        
        // totalTime is in seconds. 
        const simTime = totalTime * 2; 
        
        // --- 1. Simulation Step (BG) ---
        const bgState = this.runSimStep(
            this.glBg, this.bgSimProgram, this.quadBufferBg,
            this.bgReadFBO, this.bgWriteFBO, this.bgReadTexture, this.bgWriteTexture
        );
        this.bgReadFBO = bgState.readFBO;
        this.bgWriteFBO = bgState.writeFBO;
        this.bgReadTexture = bgState.readTex;
        this.bgWriteTexture = bgState.writeTex;

        // --- 2. Simulation Step (FG Layers) ---
        this.fgLayers.forEach(layer => {
            const fgState = this.runSimStep(
                layer.gl, layer.simProgram, layer.quadBuffer,
                layer.readFBO, layer.writeFBO, layer.readTexture, layer.writeTexture
            );
            layer.readFBO = fgState.readFBO;
            layer.writeFBO = fgState.writeFBO;
            layer.readTexture = fgState.readTex;
            layer.writeTexture = fgState.writeTex;
        });

        // --- 3. Render Background (Water Body) ---
        const glBg = this.glBg;
        glBg.bindFramebuffer(glBg.FRAMEBUFFER, null);
        glBg.viewport(0, 0, this.bgCanvas.width, this.bgCanvas.height);
        glBg.useProgram(this.bgProgram);
        
        glBg.uniform3fv(glBg.getUniformLocation(this.bgProgram, 'uColorDeep'), COLOR_DEEP);
        glBg.uniform3fv(glBg.getUniformLocation(this.bgProgram, 'uColorShallow'), COLOR_SHALLOW);
        glBg.uniform1f(glBg.getUniformLocation(this.bgProgram, 'uTime'), simTime);
        glBg.uniform2f(glBg.getUniformLocation(this.bgProgram, 'uResolution'), this.bgCanvas.width, this.bgCanvas.height);

        // Bind BG Sim Texture for distortion
        glBg.activeTexture(glBg.TEXTURE0);
        glBg.bindTexture(glBg.TEXTURE_2D, this.bgReadTexture);
        glBg.uniform1i(glBg.getUniformLocation(this.bgProgram, 'uWaveMap'), 0);

        glBg.bindBuffer(glBg.ARRAY_BUFFER, this.quadBufferBg);
        const aPosBg = glBg.getAttribLocation(this.bgProgram, 'position');
        glBg.enableVertexAttribArray(aPosBg);
        glBg.vertexAttribPointer(aPosBg, 2, glBg.FLOAT, false, 0, 0);
        
        glBg.drawArrays(glBg.TRIANGLE_STRIP, 0, 4);

        // --- 4. Render Foreground Layers (Waves/Foam) ---
        this.fgLayers.forEach(layer => {
            const glFg = layer.gl;
            glFg.bindFramebuffer(glFg.FRAMEBUFFER, null); 
            glFg.viewport(0, 0, layer.canvas.width, layer.canvas.height);
            glFg.useProgram(layer.program);
            glFg.clearColor(0, 0, 0, 0);
            glFg.clear(glFg.COLOR_BUFFER_BIT);

            glFg.activeTexture(glFg.TEXTURE0);
            glFg.bindTexture(glFg.TEXTURE_2D, layer.readTexture); // Use FG sim result
            glFg.uniform1i(glFg.getUniformLocation(layer.program, 'uWaveMap'), 0);
            
            glFg.uniform3fv(glFg.getUniformLocation(layer.program, 'uColorShallow'), COLOR_SHALLOW);
            glFg.uniform3fv(glFg.getUniformLocation(layer.program, 'uColorWave'), COLOR_WAVE); 
            glFg.uniform3fv(glFg.getUniformLocation(layer.program, 'uColorWaveDeep'), COLOR_WAVE_DEEP);
            glFg.uniform1f(glFg.getUniformLocation(layer.program, 'uTime'), simTime);

            glFg.bindBuffer(glFg.ARRAY_BUFFER, layer.quadBuffer);
            const aPosFg = glFg.getAttribLocation(layer.program, 'position');
            glFg.enableVertexAttribArray(aPosFg);
            glFg.vertexAttribPointer(aPosFg, 2, glFg.FLOAT, false, 0, 0);

            glFg.drawArrays(glFg.TRIANGLE_STRIP, 0, 4);
        });
    }
}

export const waterSystem = new WaterSystem();
