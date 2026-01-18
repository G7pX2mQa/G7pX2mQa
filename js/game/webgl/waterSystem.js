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

        // Extensions
        this.extFloat = null;
        this.extLinear = null;
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
        
        // Enable Extensions for Float Textures
        this.extFloat = gl.getExtension('OES_texture_float');
        this.extLinear = gl.getExtension('OES_texture_float_linear');

        if (!this.extFloat) {
            console.warn('WebGL OES_texture_float not supported. Water simulation may fall back to low precision or fail.');
        }

        // Shaders
        this.progSim = this.createProgram(gl, COMMON_VERTEX_SHADER, RIPPLE_SIM_FS, 'RIPPLE_SIM');
        this.progDrop = this.createProgram(gl, COMMON_VERTEX_SHADER, RIPPLE_DROP_FS, 'RIPPLE_DROP');
        this.progRender = this.createProgram(gl, COMMON_VERTEX_SHADER, WATER_RENDER_FS, 'WATER_RENDER');
        
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
        
        this.progFoam = this.createProgram(gl, FOAM_QUAD_VS, FOAM_FS, 'FOAM');
        
        this.foamBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.foamBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this.foamData.byteLength, gl.DYNAMIC_DRAW);
    }
    
    createProgram(gl, vsSrc, fsSrc, name = '') {
        if (!vsSrc || !fsSrc) {
            console.error(`Shader source missing for ${name}`, { vsLen: vsSrc?.length, fsLen: fsSrc?.length });
            return null;
        }

        const vs = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vs, vsSrc);
        gl.compileShader(vs);
        if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
            console.error(`VS Compile Error (${name}):`, gl.getShaderInfoLog(vs));
            return null;
        }
        
        const fs = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fs, fsSrc);
        gl.compileShader(fs);
        if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
            console.error(`FS Compile Error (${name}):`, gl.getShaderInfoLog(fs));
            return null;
        }
        
        const prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            console.error(`Link Error (${name}):`, gl.getProgramInfoLog(prog));
            return null;
        }

        return prog;
    }
    
    resize() {
        const dpr = Math.min(window.devicePixelRatio, 2);
        
        // BG Resize
        if (this.canvasBg) {
            const rect = this.canvasBg.getBoundingClientRect();
            
            // Prevent zero-size FBO creation
            if (rect.width > 0 && rect.height > 0) {
                this.canvasBg.width = rect.width * dpr * this.rippleRes;
                this.canvasBg.height = rect.height * dpr * this.rippleRes;
                this.bgWidth = this.canvasBg.width;
                this.bgHeight = this.canvasBg.height;
                this.initFBOs();
            }
        }
        
        // FG Resize
        if (this.canvasFg) {
            const rect = this.canvasFg.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                this.canvasFg.width = rect.width * dpr;
                this.canvasFg.height = rect.height * dpr;
                this.fgWidth = this.canvasFg.width;
                this.fgHeight = this.canvasFg.height;
                if (this.glFg) this.glFg.viewport(0, 0, this.fgWidth, this.fgHeight);
            }
        }
    }
    
    initFBOs() {
        const gl = this.glBg;
        if (!gl) return;
        
        // Cleanup existing resources to prevent leaks
        if (this.fbo1) gl.deleteFramebuffer(this.fbo1);
        if (this.tex1) gl.deleteTexture(this.tex1);
        if (this.fbo2) gl.deleteFramebuffer(this.fbo2);
        if (this.tex2) gl.deleteTexture(this.tex2);

        const createFBO = () => {
            const tex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, tex);
            
            // Determine Texture Type and Filter
            let type = gl.UNSIGNED_BYTE;
            let minFilter = gl.LINEAR;
            let magFilter = gl.LINEAR;

            if (this.extFloat) {
                type = gl.FLOAT;
                // Only use LINEAR filtering if the float_linear extension is present
                if (!this.extLinear) {
                    minFilter = gl.NEAREST;
                    magFilter = gl.NEAREST;
                }
            }

            // Safe texture initialization
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.bgWidth, this.bgHeight, 0, gl.RGBA, type, null);
            
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, magFilter);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            
            const fbo = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
            
            // Check status
            const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
            if (status !== gl.FRAMEBUFFER_COMPLETE) {
                console.error("WaterSystem: Framebuffer incomplete", status);
            }
            
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
            const rect = this.canvasBg.getBoundingClientRect(); 
            // Protect against zero rect
            if (rect.width > 0 && rect.height > 0) {
                const uvX = x / rect.width;
                const uvY = 1.0 - (y / rect.height); 
                const radiusUV = (size * 0.5) / rect.width; 
                
                this.dropQueue.push({ x: uvX, y: uvY, r: radiusUV * 2.0, s: 0.15 });
            }
        }
        
        // 2. Add Foam Particle
        if (this.foamParticles.length < this.MAX_PARTICLES) {
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
        // Verify GL, FBOs, and Programs exist
        if (!gl || !this.fbo1 || !this.fbo2) return;
        if (!this.progSim || !this.progDrop || !this.progRender) return;
        
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
            gl.useProgram(this.progDrop);
            
            // Set static uniforms once if possible, but we are switching FBOs
            const uCenter = gl.getUniformLocation(this.progDrop, 'uCenter');
            const uRadius = gl.getUniformLocation(this.progDrop, 'uRadius');
            const uStrength = gl.getUniformLocation(this.progDrop, 'uStrength');
            const uTexture = gl.getUniformLocation(this.progDrop, 'uTexture');
            const uResolution = gl.getUniformLocation(this.progDrop, 'uResolution');

            while(this.dropQueue.length > 0) {
                const d = this.dropQueue.shift();
                
                gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo2);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, this.tex1); // Read from current
                
                gl.uniform1i(uTexture, 0);
                gl.uniform2f(uResolution, this.bgWidth, this.bgHeight);
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
        // Check program and particles
        if (!gl || !this.progFoam || this.foamParticles.length === 0) {
            if (gl) gl.clear(gl.COLOR_BUFFER_BIT); 
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
