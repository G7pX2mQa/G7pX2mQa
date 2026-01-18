// js/game/webgl/waterShaders.js

export const VERTEX_SHADER = `
attribute vec2 position;
varying vec2 vUv;
void main() {
    vUv = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
}
`;

export const FRAGMENT_SHADER = `
precision mediump float;

varying vec2 vUv;
uniform float uTime;
uniform vec2 uResolution;
uniform sampler2D uWaveMap; // [R = height/intensity]
uniform vec3 uColorDeep;
uniform vec3 uColorShallow;
uniform vec3 uColorFoam;

// Simple pseudo-random noise
float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
}

float noise(vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);
    float a = random(i);
    float b = random(i + vec2(1.0, 0.0));
    float c = random(i + vec2(0.0, 1.0));
    float d = random(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a)* u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 st) {
    float v = 0.0;
    float a = 0.5;
    vec2 shift = vec2(100.0);
    mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.50));
    for (int i = 0; i < 3; ++i) {
        v += a * noise(st);
        st = rot * st * 2.0 + shift;
        a *= 0.5;
    }
    return v;
}

void main() {
    // 1. Sample Wave Map for distortion and foam
    float waveVal = texture2D(uWaveMap, vUv).r;
    
    // Calculate gradient for normal-like distortion
    // We sample slightly offset to get the slope
    float eps = 1.0 / 256.0; // Estimate
    float hRight = texture2D(uWaveMap, vUv + vec2(eps, 0.0)).r;
    float hUp    = texture2D(uWaveMap, vUv + vec2(0.0, eps)).r;
    
    vec2 distortion = vec2(hRight - waveVal, hUp - waveVal) * 5.0; // Strength multiplier
    
    // 2. Base Water Pattern
    vec2 st = gl_FragCoord.xy / uResolution.xy;
    vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
    vec2 uv = st * aspect; // For noise
    
    // Distort the UV used for noise
    vec2 distortedUV = uv + distortion * 0.2;
    
    // FBM Noise for water surface
    float noiseVal = fbm(distortedUV * 8.0 + uTime * 0.2);
    
    // 3. Mixing
    // Base color mix based on noise
    vec3 color = mix(uColorDeep, uColorShallow, noiseVal * 0.6 + 0.2);
    
    // Add Shockwave Foam
    // If waveVal is high (peak of the ring), add foam
    float foamMask = smoothstep(0.4, 0.9, waveVal);
    
    // Distort foam slightly with noise so it looks organic
    float organicFoam = foamMask * smoothstep(0.2, 0.8, noiseVal + 0.3);
    
    color = mix(color, uColorFoam, organicFoam);
    
    // Additional highlight from distortion (fake specular)
    float highlight = max(0.0, distortion.x + distortion.y) * 2.0;
    color += uColorFoam * highlight * 0.3;

    gl_FragColor = vec4(color, 1.0);
}
`;

export const WAVE_VERTEX_SHADER = `
attribute vec2 aPosition;
attribute vec2 aUv;
attribute float aAlpha;

varying vec2 vUv;
varying float vAlpha;

void main() {
    vUv = aUv;
    vAlpha = aAlpha;
    gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

export const WAVE_FRAGMENT_SHADER = `
precision mediump float;
varying vec2 vUv;
varying float vAlpha;

void main() {
    // Draw a Shockwave Ring
    // Center is 0.5, 0.5
    vec2 center = vec2(0.5);
    float dist = distance(vUv, center);
    
    // Ring shape: expand outward.
    // We assume the quad is expanding in JS, so we just draw a static ring here.
    // Sharp outer, soft inner.
    // Radius 0.5 is the edge of the quad.
    
    // "Thick expanding ring"
    float outer = smoothstep(0.5, 0.45, dist);
    float inner = smoothstep(0.25, 0.4, dist);
    
    float ring = outer * inner;
    
    // Output intensity
    gl_FragColor = vec4(ring * vAlpha, 0.0, 0.0, 1.0);
}
`;
