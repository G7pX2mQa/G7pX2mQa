import {
    VERTEX_SHADER,
    BACKGROUND_FRAGMENT_SHADER,
    FRAGMENT_SHADER,
    WAVE_VERTEX_SHADER,
    WAVE_BRUSH_FRAGMENT_SHADER,
    SIMULATION_FRAGMENT_SHADER
} from './waterShaders.js';

// --- Colors Extracted from Legacy 2D System ---
const COLOR_DEEP = [0.0, 0.3, 0.7];          // Deep Royal Blue
const COLOR_SHALLOW = [0.0, 0.7, 0.8];       // Bright Turquoise
// Updated to Vivid Oceanic Blue Gradient
const COLOR_WAVE = [0.9, 0.95, 1.0];         // White Foam (Highlights)
const COLOR_WAVE_DEEP = [0.0, 0.5, 0.6];     // Darker Turquoise (Shadows)

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
        this.fgCanvas = null;
        this.glBg = null;
        this.glFg = null;

        // Background Context Programs
        this.bgProgram = null;
        this.bgSimProgram = null;
        this.bgBrushProgram = null;

        // Foreground Context Programs
        this.fgProgram = null;
        this.fgSimProgram = null;
        this.fgBrushProgram = null;

        this.width = 0;
        this.height = 0;
        
        // Simulation State
        this.simRes = 512;
        
        // BG Sim
        this.bgReadFBO = null;
        this.bgWriteFBO = null;
        this.bgReadTexture = null;
        this.bgWriteTexture = null;
        
        // FG Sim
        this.fgReadFBO = null;
        this.fgWriteFBO = null;
        this.fgReadTexture = null;
        this.fgWriteTexture = null;

        // Buffers
        this.quadBufferBg = null;
        this.quadBufferFg = null;
        
        this.bgBrushBuffer = null;
        this.fgBrushBuffer = null;

        this._boundResize = null;
    }

    init(backCanvasId, frontCanvasId) {
        this.bgCanvas = document.getElementById(backCanvasId);
        this.fgCanvas = document.getElementById(frontCanvasId);

        if (!this.bgCanvas || !this.fgCanvas) return;

        // Enable Foreground Canvas (Previously hidden)
        this.fgCanvas.style.display = 'block';

        // Initialize WebGL Contexts
        this.glBg = this.bgCanvas.getContext('webgl', { alpha: true, depth: false }) || 
                    this.bgCanvas.getContext('experimental-webgl');
        this.glFg = this.fgCanvas.getContext('webgl', { alpha: true, depth: false }) || 
                    this.fgCanvas.getContext('experimental-webgl');

        if (!this.glBg || !this.glFg) {
            console.error('WaterSystem: WebGL not supported');
            return;
        }

        this.initShaders();
        this.initBuffers();
        this.initSimulation();
        
        this.resize();
        
        if (!this._boundResize) {
            this._boundResize = () => this.resize();
            window.addEventListener('resize', this._boundResize);
        }
    }

    initShaders() {
        // --- BG Context ---
        this.bgProgram = createProgram(this.glBg, VERTEX_SHADER, BACKGROUND_FRAGMENT_SHADER);
        this.bgSimProgram = createProgram(this.glBg, VERTEX_SHADER, SIMULATION_FRAGMENT_SHADER);
        this.bgBrushProgram = createProgram(this.glBg, WAVE_VERTEX_SHADER, WAVE_BRUSH_FRAGMENT_SHADER);

        // --- FG Context ---
        this.fgProgram = createProgram(this.glFg, VERTEX_SHADER, FRAGMENT_SHADER);
        this.fgSimProgram = createProgram(this.glFg, VERTEX_SHADER, SIMULATION_FRAGMENT_SHADER);
        this.fgBrushProgram = createProgram(this.glFg, WAVE_VERTEX_SHADER, WAVE_BRUSH_FRAGMENT_SHADER);
    }

    initBuffers() {
        const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);

        // --- BG Context ---
        const glBg = this.glBg;
        this.quadBufferBg = glBg.createBuffer();
        glBg.bindBuffer(glBg.ARRAY_BUFFER, this.quadBufferBg);
        glBg.bufferData(glBg.ARRAY_BUFFER, vertices, glBg.STATIC_DRAW);
        
        this.bgBrushBuffer = glBg.createBuffer();

        // --- FG Context ---
        const glFg = this.glFg;
        this.quadBufferFg = glFg.createBuffer();
        glFg.bindBuffer(glFg.ARRAY_BUFFER, this.quadBufferFg);
        glFg.bufferData(glFg.ARRAY_BUFFER, vertices, glFg.STATIC_DRAW);

        this.fgBrushBuffer = glFg.createBuffer();
    }

    createSimResources(gl) {
        const w = this.simRes;
        const h = this.simRes;

        // Try to enable float textures
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
        
        // Clean up
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        
        return { readFBO, writeFBO, readTex, writeTex };
    }

    initSimulation() {
        // Init BG Sim
        const bgRes = this.createSimResources(this.glBg);
        this.bgReadFBO = bgRes.readFBO;
        this.bgWriteFBO = bgRes.writeFBO;
        this.bgReadTexture = bgRes.readTex;
        this.bgWriteTexture = bgRes.writeTex;

        // Init FG Sim
        const fgRes = this.createSimResources(this.glFg);
        this.fgReadFBO = fgRes.readFBO;
        this.fgWriteFBO = fgRes.writeFBO;
        this.fgReadTexture = fgRes.readTex;
        this.fgWriteTexture = fgRes.writeTex;
    }

    resize() {
        const dpr = window.devicePixelRatio || 1;

        if (this.bgCanvas && this.glBg) {
            const rect = this.bgCanvas.getBoundingClientRect();
            this.bgCanvas.width = rect.width * dpr;
            this.bgCanvas.height = rect.height * dpr;
            this.glBg.viewport(0, 0, this.bgCanvas.width, this.bgCanvas.height);
        }

        if (this.fgCanvas && this.glFg) {
            const rect = this.fgCanvas.getBoundingClientRect();
            this.width = rect.width;
            this.height = rect.height;
            this.fgCanvas.width = rect.width * dpr;
            this.fgCanvas.height = rect.height * dpr;
            this.glFg.viewport(0, 0, this.fgCanvas.width, this.fgCanvas.height);
        }
    }

    applyBrush(gl, program, buffer, fbo, x, y, size) {
        gl.useProgram(program);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.viewport(0, 0, this.simRes, this.simRes);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);

        // Map pixels to WebGL Clip Space
        const brushSize = Math.max(0.05, size / this.width) * 7.0; 
        
        const ndcX = (x / this.width) * 2 - 1;
        const ndcY = -((y / this.height) * 2 - 1); // Flip Y for WebGL

        const s = brushSize;
        const aspect = (this.width && this.height) ? (this.width / this.height) : 1.0;

        // Counter-scale width in simulation to ensure circular shape on screen
        const shapeScale = 1.2; 
        const wX = (s * shapeScale) / aspect; 
        const wY = s * shapeScale * 0.6; // Flatten vertically
        
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
        if (!this.glFg || !this.fgBrushProgram || !this.glBg) return;

        // Apply to BG Sim
        this.applyBrush(
            this.glBg, 
            this.bgBrushProgram, 
            this.bgBrushBuffer, 
            this.bgReadFBO, 
            x, y, size
        );

        // Apply to FG Sim
        this.applyBrush(
            this.glFg, 
            this.fgBrushProgram, 
            this.fgBrushBuffer, 
            this.fgReadFBO, 
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
        // No-op
    }

    render(totalTime) {
        if (!this.glBg || !this.glFg) return;
        
        // totalTime is in seconds. 
        // We use a factor of 0.1 to ensure movement is visible but not strobing.
        const simTime = totalTime * 0.1; 
        
        // --- 1. Simulation Step (BG) ---
        const bgState = this.runSimStep(
            this.glBg, this.bgSimProgram, this.quadBufferBg,
            this.bgReadFBO, this.bgWriteFBO, this.bgReadTexture, this.bgWriteTexture
        );
        this.bgReadFBO = bgState.readFBO;
        this.bgWriteFBO = bgState.writeFBO;
        this.bgReadTexture = bgState.readTex;
        this.bgWriteTexture = bgState.writeTex;

        // --- 2. Simulation Step (FG) ---
        const fgState = this.runSimStep(
            this.glFg, this.fgSimProgram, this.quadBufferFg,
            this.fgReadFBO, this.fgWriteFBO, this.fgReadTexture, this.fgWriteTexture
        );
        this.fgReadFBO = fgState.readFBO;
        this.fgWriteFBO = fgState.writeFBO;
        this.fgReadTexture = fgState.readTex;
        this.fgWriteTexture = fgState.writeTex;

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

        // --- 4. Render Foreground (Waves/Foam) ---
        const glFg = this.glFg;
        glFg.bindFramebuffer(glFg.FRAMEBUFFER, null); 
        glFg.viewport(0, 0, this.fgCanvas.width, this.fgCanvas.height);
        glFg.useProgram(this.fgProgram);
        glFg.clearColor(0, 0, 0, 0);
        glFg.clear(glFg.COLOR_BUFFER_BIT);

        glFg.activeTexture(glFg.TEXTURE0);
        glFg.bindTexture(glFg.TEXTURE_2D, this.fgReadTexture); // Use FG sim result
        glFg.uniform1i(glFg.getUniformLocation(this.fgProgram, 'uWaveMap'), 0);
        
        glFg.uniform3fv(glFg.getUniformLocation(this.fgProgram, 'uColorShallow'), COLOR_SHALLOW);
        glFg.uniform3fv(glFg.getUniformLocation(this.fgProgram, 'uColorWave'), COLOR_WAVE); 
        glFg.uniform3fv(glFg.getUniformLocation(this.fgProgram, 'uColorWaveDeep'), COLOR_WAVE_DEEP);
        glFg.uniform1f(glFg.getUniformLocation(this.fgProgram, 'uTime'), simTime);

        glFg.bindBuffer(glFg.ARRAY_BUFFER, this.quadBufferFg);
        const aPosFg = glFg.getAttribLocation(this.fgProgram, 'position');
        glFg.enableVertexAttribArray(aPosFg);
        glFg.vertexAttribPointer(aPosFg, 2, glFg.FLOAT, false, 0, 0);

        glFg.drawArrays(glFg.TRIANGLE_STRIP, 0, 4);
    }
}

export const waterSystem = new WaterSystem();
