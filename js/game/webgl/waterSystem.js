import { VERTEX_SHADER, FRAGMENT_SHADER } from './waterShaders.js';

export class WaterSystem {
    constructor() {
        this.canvas = null;
        this.gl = null;
        this.program = null;
        this.waves = []; // { x, y, width, time, id }
        this.width = 0;
        this.height = 0;
        this.quality = 1.0; // Resolution scale
        
        // Colors (Matches CSS roughly)
        // Deep: hsl(194, 66%, 59%) -> rgb(86, 187, 219) -> 0.34, 0.73, 0.86
        // Shallow: hsl(188, 60%, 54%) -> rgb(88, 194, 206) -> 0.35, 0.76, 0.81
        // Foam: White
        this.colors = {
            deep: [0.24, 0.70, 0.80],
            shallow: [0.30, 0.80, 0.85],
            foam: [0.95, 0.98, 1.0]
        };

        this.uniformLocations = {};
    }

    init(canvasId) {
        const newCanvas = document.getElementById(canvasId);
        if (!newCanvas) {
            console.error('[WaterSystem] Canvas not found:', canvasId);
            return;
        }

        // If we are re-initializing on the same canvas, just resize and return
        if (this.gl && this.canvas === newCanvas) {
            this.resize();
            return;
        }

        this.canvas = newCanvas;

        // Try to get WebGL context
        this.gl = this.canvas.getContext('webgl', { alpha: true, depth: false, antialias: false });
        if (!this.gl) {
            console.warn('[WaterSystem] WebGL not supported');
            return;
        }

        // Enable blending for transparency
        this.gl.enable(this.gl.BLEND);
        this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);

        this.createProgram();
        this.createBuffer();
        this.resize();

        // Only add resize listener once
        if (!this._boundResize) {
            this._boundResize = () => this.resize();
            window.addEventListener('resize', this._boundResize);
        }
    }

    createProgram() {
        const gl = this.gl;
        const vs = this.compileShader(gl.VERTEX_SHADER, VERTEX_SHADER);
        const fs = this.compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);

        this.program = gl.createProgram();
        gl.attachShader(this.program, vs);
        gl.attachShader(this.program, fs);
        gl.linkProgram(this.program);

        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            console.error('[WaterSystem] Program link error:', gl.getProgramInfoLog(this.program));
            return;
        }

        gl.useProgram(this.program);

        // Cache uniform locations
        this.uniformLocations = {
            uTime: gl.getUniformLocation(this.program, 'uTime'),
            uResolution: gl.getUniformLocation(this.program, 'uResolution'),
            uWaveParams: gl.getUniformLocation(this.program, 'uWaveParams'),
            uWaveTimes: gl.getUniformLocation(this.program, 'uWaveTimes'),
            uWaveCount: gl.getUniformLocation(this.program, 'uWaveCount'),
            uColorDeep: gl.getUniformLocation(this.program, 'uColorDeep'),
            uColorShallow: gl.getUniformLocation(this.program, 'uColorShallow'),
            uColorFoam: gl.getUniformLocation(this.program, 'uColorFoam'),
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

    createBuffer() {
        const gl = this.gl;
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        // Full screen quad
        const vertices = new Float32Array([
            -1, -1,
             1, -1,
            -1,  1,
             1,  1,
        ]);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

        const posLoc = gl.getAttribLocation(this.program, 'position');
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
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
        }
    }

    setQuality(q) {
        this.quality = q;
        this.resize();
    }

    addWave(x, y, width) {
        // x, y are in pixels relative to playfield?
        // We need to normalize them to 0-1 for the shader
        // But wait, the spawner passes absolute pixels. 
        // We'll normalize in update().
        
        // Safety cap for performance to prevent lag after long sessions or huge accumulation
        const MAX_LOGICAL_WAVES = 200;
        if (this.waves.length >= MAX_LOGICAL_WAVES) {
             this.waves.shift(); // Remove oldest
        }
        
        this.waves.push({
            x, y, width,
            time: 0,
            duration: 2.5 // Seconds
        });
    }

    update(dt) {
        // Update wave timers
        for (let i = this.waves.length - 1; i >= 0; i--) {
            const w = this.waves[i];
            w.time += dt;
            // Simple motion: move down
            // In the DOM version, it was CSS transition. 
            // Here we must move the Y manually.
            // DOM: translateY(-8px) -> translateY(surgeDistance)
            // Let's assume average speed. 
            // 200px over 2.6s ~ 75px/s
            
            w.y += 100 * dt; 
            
            if (w.time > w.duration) {
                this.waves.splice(i, 1);
            }
        }
    }

    render(totalTime) {
        if (!this.gl || !this.program) return;
        
        // Auto-recover from 0x0 size (e.g. if initialized while hidden)
        if (this.width === 0 || this.height === 0) {
            this.resize();
        }

        if (this.width === 0 || this.height === 0) return;

        const gl = this.gl;

        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(this.program);

        gl.uniform1f(this.uniformLocations.uTime, totalTime);
        gl.uniform2f(this.uniformLocations.uResolution, this.width, this.height);
        gl.uniform3fv(this.uniformLocations.uColorDeep, this.colors.deep);
        gl.uniform3fv(this.uniformLocations.uColorShallow, this.colors.shallow);
        gl.uniform3fv(this.uniformLocations.uColorFoam, this.colors.foam);

        // Pack waves into uniforms
        // Max 20 waves as per shader
        const MAX_WAVES = 20;
        const paramsArray = new Float32Array(MAX_WAVES * 3);
        const timesArray = new Float32Array(MAX_WAVES);
        
        // Helper to normalize
        // We assume the canvas covers the whole playfield area
        // So x/width, y/height
        const cssWidth = this.canvas.width / (Math.min(window.devicePixelRatio, 2) * this.quality);
        const cssHeight = this.canvas.height / (Math.min(window.devicePixelRatio, 2) * this.quality);

        const count = Math.min(this.waves.length, MAX_WAVES);
        
        for (let i = 0; i < count; i++) {
            const w = this.waves[i];
            
            const nx = w.x / cssWidth;
            const ny = w.y / cssHeight;
            const nw = w.width / cssWidth;
            
            paramsArray[i*3 + 0] = nx;
            paramsArray[i*3 + 1] = ny;
            paramsArray[i*3 + 2] = nw;
            
            timesArray[i] = w.time;
        }
        
        gl.uniform3fv(this.uniformLocations.uWaveParams, paramsArray);
        gl.uniform1fv(this.uniformLocations.uWaveTimes, timesArray);
        gl.uniform1i(this.uniformLocations.uWaveCount, count);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
}

export const waterSystem = new WaterSystem();
