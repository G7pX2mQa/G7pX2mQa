
const VERTEX_SHADER = `
precision mediump float;
attribute vec2 aPosition;
attribute vec2 aUv;
varying vec2 vUv;
uniform float uLayer; // 0.0 to 1.0
uniform float uRotation;
uniform float uThickness; 
uniform float uMinX;

void main() {
    vUv = aUv;
    
    float cosR = cos(uRotation);
    float sinR = sin(uRotation);
    
    // Centered Z offset
    float zOffset = (uLayer - 0.5) * uThickness;
    
    vec3 pos = vec3(aPosition, zOffset);
    
    // Rotate Y
    // x = pos.x * cosR - pos.z * sinR;
    // We separate the width term (pos.x * cosR) from the center shift (-pos.z * sinR)
    
    float centerTerm = -pos.z * sinR;
    float widthTerm = pos.x * cosR;
    
    // Enforce minimum width
    // We want widthTerm to have magnitude at least uMinX, preserving sign
    // If widthTerm is too small, we boost it.
    // If cosR is 0, we need a fallback sign based on rotation direction/phase?
    // Actually, sign(cosR) is enough. If cosR is exactly 0, we pick arbitrary sign (e.g. 1.0).
    
    float s = sign(cosR);
    if (s == 0.0) s = 1.0;
    
    // Effective width scale should be max(abs(cosR), uMinX)
    // But applied to pos.x
    // So x = centerTerm + pos.x * s * max(abs(cosR), uMinX);
    // Wait, widthTerm was pos.x * cosR.
    // If pos.x is 1, term is cosR.
    // If pos.x is -1, term is -cosR.
    // So we want:
    
    float effectiveScale = abs(cosR) + uMinX * abs(sinR);
    widthTerm = pos.x * s * effectiveScale;
    
    float x = centerTerm + widthTerm;
    float z = pos.x * sinR + pos.z * cosR;
    
    // Simple Orthographic Projection
    // Z is passed for depth buffer
    // We scale down slightly to fit rotation
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
    
    // Slight darkening for inner layers to simulate shadow/volume
    // Outer layers (0.0 and 1.0) are brightest
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
        this.instances = []; // { canvas, gl, program, buffer, texture }
        this.currentImageUrl = null;
        this.image = null; // Image object
        this.layerCount = 30; // Number of layers
        this.thickness = 0.4; // Thickness of the stack
        
        this.rotation = Math.PI / 2;
        this.speed = 1.0;
        this._dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
    }

    addCanvas(canvas) {
        // High DPI handling
        const rect = canvas.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
            canvas.width = Math.round(rect.width * this._dpr);
            canvas.height = Math.round(rect.height * this._dpr);
        }

        const gl = canvas.getContext('webgl', { alpha: true, depth: true, antialias: true }) || 
                   canvas.getContext('experimental-webgl');
        
        if (!gl) {
            console.error('WebGL not supported for waterwheel');
            return;
        }

        const program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
        if (!program) return;

        // Vertices for a quad (x, y, u, v)
        // Y is inverted for UV or Position? 
        // Standard GL: -1,-1 is bottom left. UV 0,0 is usually top-left or bottom-left depending on image.
        // Let's assume standard UV (0,0 bottom-left) matches GL image upload.
        const vertices = new Float32Array([
            // X, Y, U, V
            -1, -1, 0, 1,
             1, -1, 1, 1,
            -1,  1, 0, 0,
             1,  1, 1, 0
        ]);

        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

        const instance = {
            canvas,
            gl,
            program,
            buffer,
            texture: null
        };
        
        this.instances.push(instance);
        
        // Initial setup
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        // If we already have an image loaded, upload it
        if (this.image && this.image.complete) {
            this.uploadTexture(instance, this.image);
        } else if (this.currentImageUrl) {
             // Will be handled when image loads or setImage is called
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
            this.instances.forEach(inst => this.uploadTexture(inst, img));
        };
    }
    
    uploadTexture(instance, image) {
        const gl = instance.gl;
        if (instance.texture) gl.deleteTexture(instance.texture);
        
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        // Flip Y for texture coords
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); // UVs are already flipped in vertex data (0 at top)? 
        // Wait, in my vertex data: 
        // -1, 1 (Top Left) -> 0, 0 (Top Left UV?)
        // Let's check: -1, 1 is Top-Left in Clip Space.
        // Texture UV 0,0 is usually Bottom-Left in GL.
        // So if I map -1,1 to 0,0, I need UNPACK_FLIP_Y_WEBGL = true?
        // Or I map -1,1 to 0,0 (Top Left) which is inverted V.
        // My vertex data: (-1, 1) -> (0, 0). (1, 1) -> (1, 0).
        // So V=0 at top. V=1 at bottom.
        // GL texture 0,0 is bottom left. So V=0 is bottom.
        // So V is flipped.
        // Standard image load: Top row is at memory start.
        // If I upload as is, memory start maps to V=0 (bottom).
        // So top of image maps to bottom of quad. Upside down.
        // So I need UNPACK_FLIP_Y_WEBGL = true to flip memory so top row maps to V=1 (top).
        // Or I flip V in vertex data.
        // Let's rely on UNPACK_FLIP_Y_WEBGL = 1.
        
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
        
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        
        instance.texture = tex;
    }

    render(dt) {
        // Rotate
        this.rotation += dt * this.speed;
        
        const layerCount = this.layerCount;
        
        this.instances.forEach(inst => {
            const gl = inst.gl;
            if (!inst.texture) return;
            
            // Check for size change (DPI change or resize)
            // Ideally we do this in a resize handler, but doing it here is robust
            const rect = inst.canvas.getBoundingClientRect();
            const width = Math.round(rect.width * this._dpr);
            const height = Math.round(rect.height * this._dpr);
            
            if (inst.canvas.width !== width || inst.canvas.height !== height) {
                inst.canvas.width = width;
                inst.canvas.height = height;
            }

            gl.viewport(0, 0, inst.canvas.width, inst.canvas.height);
            gl.clearColor(0, 0, 0, 0); // Transparent background
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            
            gl.useProgram(inst.program);
            
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, inst.texture);
            gl.uniform1i(gl.getUniformLocation(inst.program, 'uTexture'), 0);
            
            gl.uniform1f(gl.getUniformLocation(inst.program, 'uRotation'), this.rotation);
            gl.uniform1f(gl.getUniformLocation(inst.program, 'uThickness'), this.thickness);
            
            // Calculate minimum width in clip space (approx 2.5 pixels)
            // Clip width is 2.0.
            // minX = 2.5 / width * 2.0
            const minX = (2.5 / Math.max(1, width)) * 2.0;
            gl.uniform1f(gl.getUniformLocation(inst.program, 'uMinX'), minX);
            
            const uLayerLoc = gl.getUniformLocation(inst.program, 'uLayer');
            
            gl.bindBuffer(gl.ARRAY_BUFFER, inst.buffer);
            
            // Setup attributes
            const aPos = gl.getAttribLocation(inst.program, 'aPosition');
            const aUv = gl.getAttribLocation(inst.program, 'aUv');
            
            // Stride 4 floats * 4 bytes = 16
            gl.enableVertexAttribArray(aPos);
            gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
            
            gl.enableVertexAttribArray(aUv);
            gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 16, 8);
            
            // Draw Layers
            for (let i = 0; i < layerCount; i++) {
                // Normalize layer from 0 to 1
                const layerNorm = i / (layerCount - 1);
                gl.uniform1f(uLayerLoc, layerNorm);
                
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            }
        });
    }
    
    clear() {
        this.instances = [];
    }
}
