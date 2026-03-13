
const VERTEX_SHADER = `
precision mediump float;
attribute vec2 aPosition;
attribute vec2 aUv;
varying vec2 vUv;
uniform float uLayer; /* 0.0 to 1.0 */
uniform float uRotation;
uniform float uThickness; 
uniform float uMinX;

void main() {
    vUv = aUv;
    
    float cosR = cos(uRotation);
    float sinR = sin(uRotation);
    
    /* Centered Z offset */
    float zOffset = (uLayer - 0.5) * uThickness;
    
    vec3 pos = vec3(aPosition, zOffset);
    
    /* Rotate Y */
    /* x = pos.x * cosR - pos.z * sinR; */
    /* We separate the width term (pos.x * cosR) from the center shift (-pos.z * sinR) */
    
    float centerTerm = -pos.z * sinR;
    float widthTerm = pos.x * cosR;
    
    /* Enforce minimum width */
    /* We want widthTerm to have magnitude at least uMinX, preserving sign */
    /* If widthTerm is too small, we boost it. */
    /* If cosR is 0, we need a fallback sign based on rotation direction/phase? */
    /* Actually, sign(cosR) is enough. If cosR is exactly 0, we pick arbitrary sign (e.g. 1.0). */
    
    float s = sign(cosR);
    if (s == 0.0) s = 1.0;
    
    /* Effective width scale should be max(abs(cosR), uMinX) */
    /* But applied to pos.x */
    /* So x = centerTerm + pos.x * s * max(abs(cosR), uMinX); */
    /* Wait, widthTerm was pos.x * cosR. */
    /* If pos.x is 1, term is cosR. */
    /* If pos.x is -1, term is -cosR. */
    /* So we want: */
    
    float effectiveScale = abs(cosR) + uMinX * abs(sinR);
    widthTerm = pos.x * s * effectiveScale;
    
    float x = centerTerm + widthTerm;
    float z = pos.x * sinR + pos.z * cosR;
    
    /* Simple Orthographic Projection */
    /* Z is passed for depth buffer */
    /* We scale down slightly to fit rotation */
    gl_Position = vec4(x * 0.8, pos.y * 0.8, z * 0.5, 1.0); 
}
`;

const FRAGMENT_SHADER = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTexture;
uniform float uLayer;

void main() {
    vec4 color = texture2D(uTexture, vUv);
    if (color.a < 0.1) discard;
    
    /* Slight darkening for inner layers to simulate shadow/volume */
    /* Outer layers (0.0 and 1.0) are brightest */
    float dist = abs(uLayer - 0.5) * 2.0; 
    float shade = 0.6 + 0.4 * dist; 
    
    gl_FragColor = vec4(color.rgb * shade, color.a);
}
`;

function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
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
        console.error(gl.getProgramInfoLog(program));
        return null;
    }
    return program;
}

export class WaterwheelRenderer {
    constructor() {
        this.instances = []; // Array of DOM canvas contexts: { canvas, ctx }
        this.currentImageUrl = null;
        this.image = null; // Image object
        this.layerCount = 30; // Number of layers
        this.thickness = 0.4; // Thickness of the stack
        
        this.rotation = Math.PI / 2;
        this.speed = 1.0;
        this._dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;

        this._setupOffscreenWebGL();
    }

    _setupOffscreenWebGL() {
        if (typeof document === 'undefined') return;
        
        this.offscreenCanvas = document.createElement('canvas');
        // Initial size, will be resized on render based on max dimensions needed
        this.offscreenCanvas.width = 128; 
        this.offscreenCanvas.height = 128;

        const gl = this.offscreenCanvas.getContext('webgl', { alpha: true, depth: true, antialias: true }) || 
                   this.offscreenCanvas.getContext('experimental-webgl');
        
        if (!gl) {
            console.error('WebGL not supported for waterwheel');
            return;
        }
        
        this.gl = gl;

        this.program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
        if (!this.program) return;

        const vertices = new Float32Array([
            // X, Y, U, V
            -1, -1, 0, 1,
             1, -1, 1, 1,
            -1,  1, 0, 0,
             1,  1, 1, 0
        ]);

        this.buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

        this.texture = null;

        // Initial setup
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }

    addCanvas(canvas) {
        // High DPI handling setup initially
        const rect = canvas.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
            canvas.width = Math.round(rect.width * this._dpr);
            canvas.height = Math.round(rect.height * this._dpr);
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            console.error('2D context not supported for waterwheel canvas instance');
            return;
        }

        this.instances.push({ canvas, ctx });
        
        // If we already have an image loaded, upload it to the main GL context (handled in constructor/setImage)
        if (this.image && this.image.complete && !this.texture) {
            this.uploadTexture(this.image);
        }
    }

    setImage(url) {
        if (this.currentImageUrl === url) return;
        this.currentImageUrl = url;
        
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.src = url;
        img.onload = () => {
            this.image = img;
            this.uploadTexture(img);
        };
    }
    
    uploadTexture(image) {
        if (!this.gl) return;
        const gl = this.gl;

        if (this.texture) gl.deleteTexture(this.texture);
        
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
        
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        
        this.texture = tex;
    }

    render(dt) {
        if (!this.gl || !this.texture || this.instances.length === 0) return;

        // Rotate
        this.rotation += dt * this.speed;
        
        // Determine the maximum size needed for all instances
        let maxWidth = 0;
        let maxHeight = 0;

        for (const inst of this.instances) {
            const rect = inst.canvas.getBoundingClientRect();
            const width = Math.round(rect.width * this._dpr);
            const height = Math.round(rect.height * this._dpr);

            if (inst.canvas.width !== width || inst.canvas.height !== height) {
                inst.canvas.width = width;
                inst.canvas.height = height;
            }

            if (width > maxWidth) maxWidth = width;
            if (height > maxHeight) maxHeight = height;
        }

        if (maxWidth === 0 || maxHeight === 0) return;

        // Resize the offscreen WebGL canvas if necessary
        if (this.offscreenCanvas.width !== maxWidth || this.offscreenCanvas.height !== maxHeight) {
            this.offscreenCanvas.width = maxWidth;
            this.offscreenCanvas.height = maxHeight;
        }

        const gl = this.gl;
        const program = this.program;

        // --- Render once to offscreen WebGL canvas ---
        gl.viewport(0, 0, maxWidth, maxHeight);
        gl.clearColor(0, 0, 0, 0); // Transparent background
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        
        gl.useProgram(program);
        
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.uniform1i(gl.getUniformLocation(program, 'uTexture'), 0);
        
        gl.uniform1f(gl.getUniformLocation(program, 'uRotation'), this.rotation);
        gl.uniform1f(gl.getUniformLocation(program, 'uThickness'), this.thickness);
        
        const minX = (2.5 / Math.max(1, maxWidth)) * 2.0;
        gl.uniform1f(gl.getUniformLocation(program, 'uMinX'), minX);
        
        const uLayerLoc = gl.getUniformLocation(program, 'uLayer');
        
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        
        const aPos = gl.getAttribLocation(program, 'aPosition');
        const aUv = gl.getAttribLocation(program, 'aUv');
        
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
        
        gl.enableVertexAttribArray(aUv);
        gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 16, 8);
        
        for (let i = 0; i < this.layerCount; i++) {
            const layerNorm = i / (this.layerCount - 1);
            gl.uniform1f(uLayerLoc, layerNorm);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }

        // --- Copy rendered image to all DOM canvases ---
        for (const inst of this.instances) {
            const ctx = inst.ctx;
            const w = inst.canvas.width;
            const h = inst.canvas.height;

            if (w === 0 || h === 0) continue;

            ctx.clearRect(0, 0, w, h);
            
            // Draw the offscreen canvas to the DOM canvas.
            // Since the offscreen canvas might be larger than this instance's canvas (if there are varying sizes),
            // we scale it to fit.
            ctx.drawImage(this.offscreenCanvas, 0, 0, maxWidth, maxHeight, 0, 0, w, h);
        }
    }
    
    clear() {
        this.instances = [];
    }
}
