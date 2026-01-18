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

        this.width = 0;
        this.height = 0;
        this.lastTime = 0;

        // Simulation State
        this.simRes = 256;
        this.readFBO = null;
        this.writeFBO = null;
        this.readTexture = null;
        this.writeTexture = null;

        // Buffers
        this.quadBufferBg = null;
        this.quadBufferFg = null;
        this.brushBuffer = null;

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

        // Foreground Quad (for Sim and Render)
        const glFg = this.glFg;
        this.quadBufferFg = glFg.createBuffer();
        glFg.bindBuffer(glFg.ARRAY_BUFFER, this.quadBufferFg);
        glFg.bufferData(glFg.ARRAY_BUFFER, vertices, glFg.STATIC_DRAW);

        // Brush Buffer (Dynamic)
        this.brushBuffer = glFg.createBuffer();
    }

    initSimulation() {
        const gl = this.glFg;
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

        this.readTexture = createTex();
        this.writeTexture = createTex();

        this.readFBO = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.readFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.readTexture, 0);

        this.writeFBO = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.writeFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.writeTexture, 0);
        
        // Check FBO status
        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        if (status !== gl.FRAMEBUFFER_COMPLETE) {
            console.warn('WaterSystem: Float FBO not supported, fallback to BYTE');
            // Fallback logic could go here (recreate textures with UNSIGNED_BYTE)
            // For now we assume decent hardware
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
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
        const gl = this.glFg;

        gl.useProgram(this.brushProgram);
        // Draw into the READ FBO (which is the current state)
        // Note: Ideally we draw into Write, but we need to accumulate.
        // For simplicity, we draw into ReadTexture so the next Sim step picks it up.
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.readFBO);
        gl.viewport(0, 0, this.simRes, this.simRes);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);

        // Compute Quad coordinates (-1 to 1)
        // Note: 'size' is in pixels.
        // We need to map pixels to WebGL Clip Space
        const brushSize = Math.max(0.05, size / this.width) * 4.0; // Boost size for visibility
        
        const ndcX = (x / this.width) * 2 - 1;
        const ndcY = -((y / this.height) * 2 - 1); // Flip Y for WebGL

        const s = brushSize;
        // Quad vertices: x, y, u, v, alpha
        // Alpha hardcoded to 1.0 for now
        const data = new Float32Array([
            ndcX - s, ndcY - s, 0, 0, 1,
            ndcX + s, ndcY - s, 1, 0, 1,
            ndcX - s, ndcY + s, 0, 1, 1,
            ndcX + s, ndcY + s, 1, 1, 1
        ]);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.brushBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);

        const aPos = gl.getAttribLocation(this.brushProgram, 'aPosition');
        const aUv = gl.getAttribLocation(this.brushProgram, 'aUv');
        const aAlpha = gl.getAttribLocation(this.brushProgram, 'aAlpha');

        // Stride = 5 floats * 4 bytes = 20
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 20, 0);

        gl.enableVertexAttribArray(aUv);
        gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 20, 8);

        gl.enableVertexAttribArray(aAlpha);
        gl.vertexAttribPointer(aAlpha, 1, gl.FLOAT, false, 20, 16);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        gl.disable(gl.BLEND);
        
        // Restore Viewport
        gl.viewport(0, 0, this.fgCanvas.width, this.fgCanvas.height);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    update(dt) {
        // No-op, we use render loop
    }

    render(totalTime) {
        if (!this.glBg || !this.glFg) return;
        
        // Update Time (Slower speed)
        // We use totalTime directly but scale it in the shader call
        const simTime = totalTime * 0.001 * 0.5; // Slow down factor
        
        // --- 1. Simulation Step (Foreground Context) ---
        const glFg = this.glFg;
        glFg.useProgram(this.simProgram);
        glFg.viewport(0, 0, this.simRes, this.simRes);
        
        // Write to WriteFBO
        glFg.bindFramebuffer(glFg.FRAMEBUFFER, this.writeFBO);
        
        // Read from ReadTexture
        glFg.activeTexture(glFg.TEXTURE0);
        glFg.bindTexture(glFg.TEXTURE_2D, this.readTexture);
        glFg.uniform1i(glFg.getUniformLocation(this.simProgram, 'uLastFrame'), 0);
        glFg.uniform2f(glFg.getUniformLocation(this.simProgram, 'uResolution'), this.simRes, this.simRes);
        glFg.uniform1f(glFg.getUniformLocation(this.simProgram, 'uDt'), 0.016); // Fixed timestep approximation

        // Draw Full Screen Quad
        glFg.bindBuffer(glFg.ARRAY_BUFFER, this.quadBufferFg);
        const aPosSim = glFg.getAttribLocation(this.simProgram, 'position');
        glFg.enableVertexAttribArray(aPosSim);
        glFg.vertexAttribPointer(aPosSim, 2, glFg.FLOAT, false, 0, 0);
        
        glFg.drawArrays(glFg.TRIANGLE_STRIP, 0, 4);

        // Swap
        const temp = this.readTexture;
        this.readTexture = this.writeTexture;
        this.writeTexture = temp;

        const tempFBO = this.readFBO;
        this.readFBO = this.writeFBO;
        this.writeFBO = tempFBO;

        // --- 2. Render Background (Water Body) ---
        const glBg = this.glBg;
        glBg.viewport(0, 0, this.bgCanvas.width, this.bgCanvas.height);
        glBg.useProgram(this.bgProgram);
        
        glBg.uniform3fv(glBg.getUniformLocation(this.bgProgram, 'uColorDeep'), COLOR_DEEP);
        glBg.uniform3fv(glBg.getUniformLocation(this.bgProgram, 'uColorShallow'), COLOR_SHALLOW);
        glBg.uniform1f(glBg.getUniformLocation(this.bgProgram, 'uTime'), simTime);
        glBg.uniform2f(glBg.getUniformLocation(this.bgProgram, 'uResolution'), this.bgCanvas.width, this.bgCanvas.height);

        glBg.bindBuffer(glBg.ARRAY_BUFFER, this.quadBufferBg);
        const aPosBg = glBg.getAttribLocation(this.bgProgram, 'position');
        glBg.enableVertexAttribArray(aPosBg);
        glBg.vertexAttribPointer(aPosBg, 2, glBg.FLOAT, false, 0, 0);
        
        glBg.drawArrays(glBg.TRIANGLE_STRIP, 0, 4);

        // --- 3. Render Foreground (Waves/Foam) ---
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
        // Note: uColorDeep is unused in FG shader logic but we can pass it
        glFg.uniform1f(glFg.getUniformLocation(this.fgProgram, 'uTime'), simTime);

        glFg.bindBuffer(glFg.ARRAY_BUFFER, this.quadBufferFg);
        const aPosFg = glFg.getAttribLocation(this.fgProgram, 'position');
        glFg.enableVertexAttribArray(aPosFg);
        glFg.vertexAttribPointer(aPosFg, 2, glFg.FLOAT, false, 0, 0);

        glFg.drawArrays(glFg.TRIANGLE_STRIP, 0, 4);
    }
}

export const waterSystem = new WaterSystem();
