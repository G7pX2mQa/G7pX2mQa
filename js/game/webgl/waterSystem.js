import { COMMON_VERTEX_SHADER, RIPPLE_SIM_FS, RIPPLE_DROP_FS, WATER_RENDER_FS, FOAM_QUAD_VS, FOAM_FS } from './waterShaders.js';

export class WaterSystem {
    constructor() {
        // --- Contexts ---
        this.glBg = null;
        this.glFg = null;
        this.canvasBg = null;
        this.canvasFg = null;
        
        // --- Background (Ripple Sim) ---
        this.bgWidth = 0;
        this.bgHeight = 0;
        this.rippleRes = 0.5; // Resolution scale for simulation
        
        this.fbo1 = null; this.tex1 = null;
        this.fbo2 = null; this.tex2 = null;
        this.bgQuadBuffer = null;
        
        this.progSim = null;
        this.progDrop = null;
        this.progRender = null;
        
        this.dropQueue = []; // {x, y, radius, strength} (Normalized UV)
        
        // --- Foreground (Foam) ---
        this.fgWidth = 0;
        this.fgHeight = 0;
        
        this.foamParticles = []; 
        this.MAX_PARTICLES = 1000;
        this.foamData = new Float32Array(this.MAX_PARTICLES * 6 * 6); // 6 verts * 6 floats (2pos + 2center + 1size + 1life)
        this.foamBuffer = null;
        this.progFoam = null;
    }

    init(bgId, fgId) {
        this.canvasBg = document.getElementById(bgId);
        this.canvasFg = document.getElementById(fgId);
        
        if (!this.canvasBg || !this.canvasFg) return;
        
        // Initialize Background GL
        this.glBg = this.canvasBg.getContext('webgl', { depth: false, alpha: false });
        // Initialize Foreground GL
        this.glFg = this.canvasFg.getContext('webgl', { depth: false, alpha: true, premultipliedAlpha: false });
        
        if (!this.glBg || !this.glFg) {
            console.error('WebGL not supported');
            return;
        }
        
        this.initBg();
        this.initFg();
        
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }
    
    initBg() {
        const gl = this.glBg;
        gl.disable(gl.DEPTH_TEST);
        
        // Shaders
        this.progSim = this.createProgram(gl, COMMON_VERTEX_SHADER, RIPPLE_SIM_FS);
        this.progDrop = this.createProgram(gl, COMMON_VERTEX_SHADER, RIPPLE_DROP_FS);
        this.progRender = this.createProgram(gl, COMMON_VERTEX_SHADER, WATER_RENDER_FS);
        
        // Quad Buffer
        this.bgQuadBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bgQuadBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1, -1, 0, 0,
             1, -1, 1, 0,
            -1,  1, 0, 1,
             1,  1, 1, 1
        ]), gl.STATIC_DRAW);
        
        // FBOs created in resize()
    }
    
    initFg() {
        const gl = this.glFg;
        gl.disable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        
        this.progFoam = this.createProgram(gl, FOAM_QUAD_VS, FOAM_FS);
        
        this.foamBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.foamBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this.foamData.byteLength, gl.DYNAMIC_DRAW);
    }
    
    createProgram(gl, vsSrc, fsSrc) {
        const vs = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vs, vsSrc);
        gl.compileShader(vs);
        if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
            console.error(gl.getShaderInfoLog(vs));
            return null;
        }
        
        const fs = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fs, fsSrc);
        gl.compileShader(fs);
        if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
            console.error(gl.getShaderInfoLog(fs));
            return null;
        }
        
        const prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        return prog;
    }
    
    resize() {
        const dpr = Math.min(window.devicePixelRatio, 2);
        
        // BG Resize
        if (this.canvasBg) {
            const rect = this.canvasBg.getBoundingClientRect();
            this.canvasBg.width = rect.width * dpr * this.rippleRes;
            this.canvasBg.height = rect.height * dpr * this.rippleRes;
            this.bgWidth = this.canvasBg.width;
            this.bgHeight = this.canvasBg.height;
            this.initFBOs();
        }
        
        // FG Resize
        if (this.canvasFg) {
            const rect = this.canvasFg.getBoundingClientRect();
            this.canvasFg.width = rect.width * dpr;
            this.canvasFg.height = rect.height * dpr;
            this.fgWidth = this.canvasFg.width;
            this.fgHeight = this.canvasFg.height;
            if (this.glFg) this.glFg.viewport(0, 0, this.fgWidth, this.fgHeight);
        }
    }
    
    initFBOs() {
        const gl = this.glBg;
        if (!gl) return;
        
        const createFBO = () => {
            const tex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.bgWidth, this.bgHeight, 0, gl.RGBA, gl.FLOAT, null) ||
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.bgWidth, this.bgHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            
            const fbo = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
            return { fbo, tex };
        };
        
        const f1 = createFBO();
        this.fbo1 = f1.fbo; this.tex1 = f1.tex;
        
        const f2 = createFBO();
        this.fbo2 = f2.fbo; this.tex2 = f2.tex;
        
        // Clear
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo1);
        gl.clearColor(0,0,0,0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo2);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    
    addWave(x, y, size) {
        // x,y are screen coordinates (pixels). size is pixel diameter.
        
        // 1. Add Ripple Drop
        if (this.canvasBg) {
            // Need normalized 0..1 coordinates for shader
            // Assume canvasBg covers screen or at least x,y are relative to it?
            // domInit makes canvas fullscreen fixed.
            const rect = this.canvasBg.getBoundingClientRect(); // Should match window if fixed inset 0
            const uvX = x / rect.width;
            const uvY = 1.0 - (y / rect.height); // Flip Y for WebGL texture coords usually
            const radiusUV = (size * 0.5) / rect.width; 
            
            this.dropQueue.push({ x: uvX, y: uvY, r: radiusUV * 2.0, s: 0.15 });
        }
        
        // 2. Add Foam Particle
        if (this.foamParticles.length < this.MAX_PARTICLES) {
            // Foam moves down. Start at impact.
            this.foamParticles.push({
                x: x, 
                y: y,
                size: size * 2.0, // Initial splash size
                life: 1.0,
                vx: (Math.random() - 0.5) * 50,
                vy: 100 + Math.random() * 100 // Move down
            });
        }
    }
    
    update(dt) {
        // Update Foam
        for (let i = this.foamParticles.length - 1; i >= 0; i--) {
            const p = this.foamParticles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= dt * 1.5; // Fade fast
            p.size += dt * 50; // Expand
            
            if (p.life <= 0) {
                this.foamParticles.splice(i, 1);
            }
        }
    }
    
    render(totalTime) {
        this.renderBg(totalTime);
        this.renderFg(totalTime);
    }
    
    renderBg(time) {
        const gl = this.glBg;
        if (!gl || !this.fbo1 || !this.fbo2) return;
        
        gl.viewport(0, 0, this.bgWidth, this.bgHeight);
        
        const drawQuad = (prog) => {
            gl.useProgram(prog);
            const posLoc = gl.getAttribLocation(prog, 'aPosition');
            const uvLoc = gl.getAttribLocation(prog, 'aUv');
            
            gl.bindBuffer(gl.ARRAY_BUFFER, this.bgQuadBuffer);
            gl.enableVertexAttribArray(posLoc);
            gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
            gl.enableVertexAttribArray(uvLoc);
            gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 16, 8);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        };
        
        // 1. Process Drops (Ping-Pong)
        if (this.dropQueue.length > 0) {
            // Write to FBO2, reading FBO1
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo2);
            gl.useProgram(this.progDrop);
            
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.tex1);
            gl.uniform1i(gl.getUniformLocation(this.progDrop, 'uTexture'), 0);
            gl.uniform2f(gl.getUniformLocation(this.progDrop, 'uResolution'), this.bgWidth, this.bgHeight);
            
            const uCenter = gl.getUniformLocation(this.progDrop, 'uCenter');
            const uRadius = gl.getUniformLocation(this.progDrop, 'uRadius');
            const uStrength = gl.getUniformLocation(this.progDrop, 'uStrength');
            
            // Apply all drops in one go? No, shader handles one.
            // Ideally use instance drawing or loop.
            // Loop for now (simple).
            // Actually, for multiple drops, we need to accumulate.
            // Read FBO1 -> Draw Drop -> FBO2
            // Then Swap.
            
            // To process multiple drops in one frame without multiple swaps:
            // Just apply last one? Or do strictly one per frame?
            // Loop swaps.
            
            while(this.dropQueue.length > 0) {
                const d = this.dropQueue.shift();
                
                gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo2);
                gl.bindTexture(gl.TEXTURE_2D, this.tex1); // Read from current
                
                gl.uniform2f(uCenter, d.x, d.y);
                gl.uniform1f(uRadius, d.r);
                gl.uniform1f(uStrength, d.s);
                
                drawQuad(this.progDrop);
                
                // Swap
                const tempF = this.fbo1; this.fbo1 = this.fbo2; this.fbo2 = tempF;
                const tempT = this.tex1; this.tex1 = this.tex2; this.tex2 = tempT;
            }
        }
        
        // 2. Simulation Step
        // Read FBO1 -> Write FBO2
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo2);
        gl.useProgram(this.progSim);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.tex1);
        gl.uniform1i(gl.getUniformLocation(this.progSim, 'uTexture'), 0);
        gl.uniform2f(gl.getUniformLocation(this.progSim, 'uResolution'), this.bgWidth, this.bgHeight);
        gl.uniform1f(gl.getUniformLocation(this.progSim, 'uDamping'), 0.98);
        drawQuad(this.progSim);
        
        // Swap
        const tempF = this.fbo1; this.fbo1 = this.fbo2; this.fbo2 = tempF;
        const tempT = this.tex1; this.tex1 = this.tex2; this.tex2 = tempT;
        
        // 3. Render to Screen
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.useProgram(this.progRender);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.tex1); // Read final state
        gl.uniform1i(gl.getUniformLocation(this.progRender, 'uTexture'), 0);
        gl.uniform2f(gl.getUniformLocation(this.progRender, 'uResolution'), this.bgWidth, this.bgHeight);
        drawQuad(this.progRender);
    }
    
    renderFg(time) {
        const gl = this.glFg;
        if (!gl || this.foamParticles.length === 0) {
            if (gl) gl.clear(gl.COLOR_BUFFER_BIT); // Ensure clear
            return;
        }
        
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(this.progFoam);
        
        // Update Buffer
        const arr = this.foamData;
        let count = 0;
        let offset = 0;
        
        for (let i = 0; i < this.foamParticles.length; i++) {
            const p = this.foamParticles[i];
            // Quad vertices (6)
            // Attributes: QuadCoord(2), Center(2), Size(1), Life(1)
            // Total 6 floats per vertex
            
            const writeVert = (qx, qy) => {
                arr[offset++] = qx; arr[offset++] = qy;
                arr[offset++] = p.x; arr[offset++] = p.y;
                arr[offset++] = p.size;
                arr[offset++] = p.life;
            };
            
            writeVert(-1, -1);
            writeVert( 1, -1);
            writeVert(-1,  1);
            writeVert(-1,  1);
            writeVert( 1, -1);
            writeVert( 1,  1);
            
            count++;
        }
        
        gl.bindBuffer(gl.ARRAY_BUFFER, this.foamBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, arr.subarray(0, count * 6 * 6));
        
        // Pointers
        const stride = 6 * 4;
        const locQuad = gl.getAttribLocation(this.progFoam, 'aQuadCoord');
        const locCenter = gl.getAttribLocation(this.progFoam, 'aCenter');
        const locSize = gl.getAttribLocation(this.progFoam, 'aSize');
        const locLife = gl.getAttribLocation(this.progFoam, 'aLife');
        
        gl.enableVertexAttribArray(locQuad);
        gl.vertexAttribPointer(locQuad, 2, gl.FLOAT, false, stride, 0);
        
        gl.enableVertexAttribArray(locCenter);
        gl.vertexAttribPointer(locCenter, 2, gl.FLOAT, false, stride, 8);
        
        gl.enableVertexAttribArray(locSize);
        gl.vertexAttribPointer(locSize, 1, gl.FLOAT, false, stride, 16);
        
        gl.enableVertexAttribArray(locLife);
        gl.vertexAttribPointer(locLife, 1, gl.FLOAT, false, stride, 20);
        
        gl.uniform2f(gl.getUniformLocation(this.progFoam, 'uResolution'), this.fgWidth, this.fgHeight);
        
        gl.drawArrays(gl.TRIANGLES, 0, count * 6);
    }
}

export const waterSystem = new WaterSystem();
