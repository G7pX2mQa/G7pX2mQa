import {
    VERTEX_SHADER,
    BACKGROUND_FRAGMENT_SHADER,
    FRAGMENT_SHADER,
    WAVE_VERTEX_SHADER,
    WAVE_BRUSH_FRAGMENT_SHADER,
    SIMULATION_FRAGMENT_SHADER
} from './waterShaders.js';

// --- Colors Extracted from Legacy 2D System ---
const COLOR_DEEP = [0.039, 0.180, 0.302];    // #0a2e4d
const COLOR_SHALLOW = [0.161, 0.502, 0.725]; // #2980b9
const COLOR_FOAM = [1.0, 1.0, 1.0];

function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compile error:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
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
        console.error('Program link error:', gl.getProgramInfoLog(program));
        return null;
    }
    return program;
}

export class WaterSystem {
    constructor() {
        this.bgCanvas = null;
        this.fgCanvas = null;
        this.glBg = null;
        this.glFg = null;

        this.bgProgram = null;
        this.fgProgram = null;
        this.simProgram = null;
        this.brushProgram = null;
        
        // Background Context Simulation Programs
        this.bgSimProgram = null;
        this.bgBrushProgram = null;

        this.width = 0;
        this.height = 0;
        this.lastTime = 0;

        // Simulation State
        this.simRes = 256;
        
        // Fg Simulation State
        this.readFBO = null;
        this.writeFBO = null;
        this.readTexture = null;
        this.writeTexture = null;

        // Bg Simulation State
        this.bgReadFBO = null;
        this.bgWriteFBO = null;
        this.bgReadTexture = null;
        this.bgWriteTexture = null;

        // Buffers
        this.quadBufferBg = null;
        this.quadBufferFg = null;
        this.brushBuffer = null;
        this.bgBrushBuffer = null; // New buffer for BG context brush

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
        // Background Context Shaders
        this.bgProgram = createProgram(this.glBg, VERTEX_SHADER, BACKGROUND_FRAGMENT_SHADER);
        this.bgSimProgram = createProgram(this.glBg, VERTEX_SHADER, SIMULATION_FRAGMENT_SHADER);
        this.bgBrushProgram = createProgram(this.glBg, WAVE_VERTEX_SHADER, WAVE_BRUSH_FRAGMENT_SHADER);

        // Foreground Context Shaders
        this.fgProgram = createProgram(this.glFg, VERTEX_SHADER, FRAGMENT_SHADER);
        this.simProgram = createProgram(this.glFg, VERTEX_SHADER, SIMULATION_FRAGMENT_SHADER);
        this.brushProgram = createProgram(this.glFg, WAVE_VERTEX_SHADER, WAVE_BRUSH_FRAGMENT_SHADER);
    }

    initBuffers() {
        const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);

        // Background Quad
        const glBg = this.glBg;
        this.quadBufferBg = glBg.createBuffer();
        glBg.bindBuffer(glBg.ARRAY_BUFFER, this.quadBufferBg);
        glBg.bufferData(glBg.ARRAY_BUFFER, vertices, glBg.STATIC_DRAW);
        
        // Background Brush Buffer
        this.bgBrushBuffer = glBg.createBuffer();

        // Foreground Quad (for Sim and Render)
        const glFg = this.glFg;
        this.quadBufferFg = glFg.createBuffer();
        glFg.bindBuffer(glFg.ARRAY_BUFFER, this.quadBufferFg);
        glFg.bufferData(glFg.ARRAY_BUFFER, vertices, glFg.STATIC_DRAW);

        // Brush Buffer (Dynamic)
        this.brushBuffer = glFg.createBuffer();
    }

    initSimulation() {
        this.initContextSimulation(this.glFg, false);
        this.initContextSimulation(this.glBg, true);
    }

    initContextSimulation(gl, isBg) {
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
        
        // Check FBO status
        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        if (status !== gl.FRAMEBUFFER_COMPLETE) {
            console.warn('WaterSystem: Float FBO not supported, fallback to BYTE');
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        if (isBg) {
            this.bgReadTexture = readTex;
            this.bgWriteTexture = writeTex;
            this.bgReadFBO = readFBO;
            this.bgWriteFBO = writeFBO;
        } else {
            this.readTexture = readTex;
            this.writeTexture = writeTex;
            this.readFBO = readFBO;
            this.writeFBO = writeFBO;
        }
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

    // Called by Spawner when items drop
    addWave(x, y, size) {
        if (!this.glFg || !this.brushProgram) return;

        // Draw to both contexts
        this.addWaveToContext(this.glFg, this.brushProgram, this.brushBuffer, this.readFBO, x, y, size);
        this.addWaveToContext(this.glBg, this.bgBrushProgram, this.bgBrushBuffer, this.bgReadFBO, x, y, size);
    }

    addWaveToContext(gl, program, buffer, fbo, x, y, size) {
        gl.useProgram(program);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.viewport(0, 0, this.simRes, this.simRes);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);

        const brushSize = Math.max(0.05, size / this.width) * 4.0;
        
        const ndcX = (x / this.width) * 2 - 1;
        const ndcY = -((y / this.height) * 2 - 1);

        const s = brushSize;
        const data = new Float32Array([
            ndcX - s, ndcY - s, 0, 0, 1,
            ndcX + s, ndcY - s, 1, 0, 1,
            ndcX - s, ndcY + s, 0, 1, 1,
            ndcX + s, ndcY + s, 1, 1, 1
        ]);

        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);

        const aPos = gl.getAttribLocation(program, 'aPosition');
        const aUv = gl.getAttribLocation(program, 'aUv');
        const aAlpha = gl.getAttribLocation(program, 'aAlpha');

        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 20, 0);

        gl.enableVertexAttribArray(aUv);
        gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 20, 8);

        gl.enableVertexAttribArray(aAlpha);
        gl.vertexAttribPointer(aAlpha, 1, gl.FLOAT, false, 20, 16);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        gl.disable(gl.BLEND);
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    update(dt) {
        // No-op, we use render loop
    }

    render(totalTime) {
        if (!this.glBg || !this.glFg) return;
        
        const simTime = totalTime * 0.001 * 0.5;
        
        // --- 1. Simulation Step (Both Contexts) ---
        this.stepSimulation(this.glFg, this.simProgram, this.quadBufferFg, false);
        this.stepSimulation(this.glBg, this.bgSimProgram, this.quadBufferBg, true);

        // --- 2. Render Background (Water Body) ---
        const glBg = this.glBg;
        glBg.viewport(0, 0, this.bgCanvas.width, this.bgCanvas.height);
        glBg.useProgram(this.bgProgram);
        
        glBg.uniform3fv(glBg.getUniformLocation(this.bgProgram, 'uColorDeep'), COLOR_DEEP);
        glBg.uniform3fv(glBg.getUniformLocation(this.bgProgram, 'uColorShallow'), COLOR_SHALLOW);
        glBg.uniform1f(glBg.getUniformLocation(this.bgProgram, 'uTime'), simTime);
        glBg.uniform2f(glBg.getUniformLocation(this.bgProgram, 'uResolution'), this.bgCanvas.width, this.bgCanvas.height);
        
        // Bind Wave Map (Simulation Result)
        glBg.activeTexture(glBg.TEXTURE0);
        glBg.bindTexture(glBg.TEXTURE_2D, this.bgReadTexture);
        glBg.uniform1i(glBg.getUniformLocation(this.bgProgram, 'uWaveMap'), 0);

        // Calculate height ratio for UV remapping
        const ratio = (this.fgCanvas.height > 0) ? (this.bgCanvas.height / this.fgCanvas.height) : 0.18;
        glBg.uniform1f(glBg.getUniformLocation(this.bgProgram, 'uHeightRatio'), ratio);

        glBg.bindBuffer(glBg.ARRAY_BUFFER, this.quadBufferBg);
        const aPosBg = glBg.getAttribLocation(this.bgProgram, 'position');
        glBg.enableVertexAttribArray(aPosBg);
        glBg.vertexAttribPointer(aPosBg, 2, glBg.FLOAT, false, 0, 0);
        
        glBg.drawArrays(glBg.TRIANGLE_STRIP, 0, 4);

        // --- 3. Render Foreground (Waves/Foam) ---
        const glFg = this.glFg;
        glFg.bindFramebuffer(glFg.FRAMEBUFFER, null); // Screen
        glFg.viewport(0, 0, this.fgCanvas.width, this.fgCanvas.height);
        glFg.useProgram(this.fgProgram);
        glFg.clearColor(0, 0, 0, 0);
        glFg.clear(glFg.COLOR_BUFFER_BIT);

        glFg.activeTexture(glFg.TEXTURE0);
        glFg.bindTexture(glFg.TEXTURE_2D, this.readTexture); // Use latest sim result
        glFg.uniform1i(glFg.getUniformLocation(this.fgProgram, 'uWaveMap'), 0);
        
        glFg.uniform3fv(glFg.getUniformLocation(this.fgProgram, 'uColorShallow'), COLOR_SHALLOW);
        glFg.uniform3fv(glFg.getUniformLocation(this.fgProgram, 'uColorFoam'), COLOR_FOAM);
        glFg.uniform1f(glFg.getUniformLocation(this.fgProgram, 'uTime'), simTime);

        glFg.bindBuffer(glFg.ARRAY_BUFFER, this.quadBufferFg);
        const aPosFg = glFg.getAttribLocation(this.fgProgram, 'position');
        glFg.enableVertexAttribArray(aPosFg);
        glFg.vertexAttribPointer(aPosFg, 2, glFg.FLOAT, false, 0, 0);

        glFg.drawArrays(glFg.TRIANGLE_STRIP, 0, 4);
    }

    stepSimulation(gl, program, quadBuffer, isBg) {
        gl.useProgram(program);
        gl.viewport(0, 0, this.simRes, this.simRes);
        
        const readTex = isBg ? this.bgReadTexture : this.readTexture;
        const writeFBO = isBg ? this.bgWriteFBO : this.writeFBO;
        const writeTex = isBg ? this.bgWriteTexture : this.writeTexture;
        const readFBO = isBg ? this.bgReadFBO : this.readFBO;

        // Write to WriteFBO
        gl.bindFramebuffer(gl.FRAMEBUFFER, writeFBO);
        
        // Read from ReadTexture
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, readTex);
        gl.uniform1i(gl.getUniformLocation(program, 'uLastFrame'), 0);
        gl.uniform2f(gl.getUniformLocation(program, 'uResolution'), this.simRes, this.simRes);
        gl.uniform1f(gl.getUniformLocation(program, 'uDt'), 0.016);

        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
        const aPos = gl.getAttribLocation(program, 'position');
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
        
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        // Swap
        if (isBg) {
            this.bgReadTexture = writeTex;
            this.bgWriteTexture = readTex;
            this.bgReadFBO = writeFBO;
            this.bgWriteFBO = readFBO;
        } else {
            this.readTexture = writeTex;
            this.writeTexture = readTex;
            this.readFBO = writeFBO;
            this.writeFBO = readFBO;
        }
    }
}

export const waterSystem = new WaterSystem();
