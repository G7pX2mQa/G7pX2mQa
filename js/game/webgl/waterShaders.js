// js/game/webgl/waterShaders.js

export const COMMON_VERTEX_SHADER = `
attribute vec2 aPosition;
attribute vec2 aUv;
varying vec2 vUv;
void main() {
    vUv = aUv;
    gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

// --- RIPPLE SIMULATION (Background) ---

export const RIPPLE_SIM_FS = `
precision mediump float;
uniform sampler2D uTexture;
uniform vec2 uResolution;
uniform float uDamping;

void main() {
    vec2 uv = gl_FragCoord.xy / uResolution;
    vec2 pixel = 1.0 / uResolution;

    // R = Height, G = Velocity
    
    // Sample neighbors
    float left = texture2D(uTexture, uv + vec2(-pixel.x, 0.0)).r;
    float right = texture2D(uTexture, uv + vec2(pixel.x, 0.0)).r;
    float up = texture2D(uTexture, uv + vec2(0.0, -pixel.y)).r;
    float down = texture2D(uTexture, uv + vec2(0.0, pixel.y)).r;
    
    vec4 data = texture2D(uTexture, uv);
    float height = data.r;
    float vel = data.g;
    
    // Wave equation
    float avg = (left + right + up + down) * 0.25;
    float force = (avg - height) * 2.0; 
    
    vel += force;
    vel *= uDamping;
    height += vel;
    
    gl_FragColor = vec4(height, vel, 0.0, 1.0);
}
`;

export const RIPPLE_DROP_FS = `
precision mediump float;
uniform sampler2D uTexture;
uniform vec2 uCenter; // UV 0..1
uniform float uRadius;
uniform float uStrength;
uniform vec2 uResolution;

void main() {
    vec2 uv = gl_FragCoord.xy / uResolution;
    vec4 data = texture2D(uTexture, uv);
    
    // Aspect correction for circle
    float aspect = uResolution.x / uResolution.y;
    vec2 p = uv; 
    p.x *= aspect;
    vec2 c = uCenter;
    c.x *= aspect;
    
    float dist = distance(p, c);
    
    if (dist < uRadius) {
        float h = cos(dist / uRadius * 1.5708); // Quarter sine
        data.r -= h * uStrength; 
    }
    
    gl_FragColor = data;
}
`;

export const WATER_RENDER_FS = `
precision mediump float;
uniform sampler2D uTexture;
uniform vec2 uResolution;

void main() {
    vec2 uv = gl_FragCoord.xy / uResolution;
    vec2 pixel = 1.0 / uResolution;
    
    float h = texture2D(uTexture, uv).r;
    
    // Normal Calc
    float hL = texture2D(uTexture, uv + vec2(-pixel.x, 0.0)).r;
    float hR = texture2D(uTexture, uv + vec2(pixel.x, 0.0)).r;
    float hU = texture2D(uTexture, uv + vec2(0.0, -pixel.y)).r;
    float hD = texture2D(uTexture, uv + vec2(0.0, pixel.y)).r;
    
    vec3 normal = normalize(vec3(hL - hR, hD - hU, 0.2)); 
    vec3 lightDir = normalize(vec3(0.5, 0.7, 0.5));
    
    // Specular
    vec3 viewDir = vec3(0.0, 0.0, 1.0);
    vec3 reflectDir = reflect(-lightDir, normal);
    float spec = pow(max(dot(viewDir, reflectDir), 0.0), 16.0);
    
    // Colors
    // Deep blue background + height variation
    vec3 col = vec3(0.05, 0.2, 0.45); 
    col += (h * 0.2); // Brighter peaks
    
    col += spec * 0.3;
    
    gl_FragColor = vec4(col, 1.0);
}
`;

// --- FOAM PARTICLES (Foreground) ---

export const FOAM_QUAD_VS = `
attribute vec2 aQuadCoord; // -1..1
attribute vec2 aCenter;    // Pixels
attribute float aSize;     // Pixels
attribute float aLife;     // 0..1

uniform vec2 uResolution;

varying vec2 vUv;
varying float vLife;

void main() {
    vLife = aLife;
    vUv = aQuadCoord * 0.5 + 0.5;
    
    // Convert Pixel center to NDC
    vec2 ndcCenter = (aCenter / uResolution) * 2.0 - 1.0;
    ndcCenter.y *= -1.0; // Flip Y
    
    vec2 sizeNDC = vec2(aSize / uResolution.x, aSize / uResolution.y) * 2.0;
    
    vec2 pos = ndcCenter + (aQuadCoord * sizeNDC * 0.5);
    gl_Position = vec4(pos, 0.0, 1.0);
}
`;

export const FOAM_FS = `
precision mediump float;
varying vec2 vUv;
varying float vLife;

float hash(vec2 p) { return fract(1e4 * sin(17.0 * p.x + p.y * 0.1) * (0.1 + abs(sin(p.y * 13.0 + p.x)))); }

float noise(vec2 x) {
    vec2 i = floor(x);
    vec2 f = fract(x);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

void main() {
    float dist = distance(vUv, vec2(0.5));
    if (dist > 0.5) discard;
    
    float alpha = smoothstep(0.5, 0.3, dist);
    
    // Detailed Foam Texture
    float n = noise(vUv * 10.0 + vec2(0.0, vLife * 2.0));
    float n2 = noise(vUv * 20.0 - vec2(vLife * 3.0, 0.0));
    float finalNoise = (n + n2) * 0.5;
    
    float threshold = 1.0 - vLife; // As life drops, threshold rises
    if (finalNoise < threshold * 0.8) discard;
    
    vec3 col = vec3(0.95, 0.98, 1.0);
    
    gl_FragColor = vec4(col, alpha * vLife);
}
`;
