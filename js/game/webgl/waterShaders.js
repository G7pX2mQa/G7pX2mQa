// js/game/webgl/waterShaders.js

export const VERTEX_SHADER = `
attribute vec2 position;
varying vec2 vUv;
void main() {
    vUv = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
}
`;

// Main Water Shader (Renders the final water look using the FBO map)
export const FRAGMENT_SHADER = `
precision mediump float;

varying vec2 vUv;
uniform float uTime;
uniform vec2 uResolution;
uniform sampler2D uWaveMap; 
uniform vec3 uColorDeep;
uniform vec3 uColorShallow;
uniform vec3 uColorFoam;

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
    vec4 waveInfo = texture2D(uWaveMap, vUv);
    float waveVal = waveInfo.r; 
    
    float distFromTop = 1.0 - vUv.y;
    
    float baseLevel = 0.02; 
    
    float wavePush = waveVal * 0.80; 
    
    float waterEdge = baseLevel + wavePush;
    
    float edgeSoftness = 0.01;

    float alpha = 1.0 - smoothstep(waterEdge - edgeSoftness, waterEdge, distFromTop);
    
    if (alpha < 0.01) {
        gl_FragColor = vec4(0.0);
        return;
    }

    float safeEdge = max(waterEdge, 0.001);
    float depthFactor = clamp(distFromTop / safeEdge, 0.0, 1.0);
    
    float eps = 2.0 / uResolution.x;
    float hRight = texture2D(uWaveMap, vUv + vec2(eps, 0.0)).r;
    float hUp    = texture2D(uWaveMap, vUv + vec2(0.0, eps)).r;
    vec2 distortion = vec2(waveVal - hRight, waveVal - hUp) * 4.0;
    
    vec2 st = gl_FragCoord.xy / uResolution.xy;
    vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
    vec2 uv = st * aspect;
    vec2 distortedUV = uv + distortion * 0.05;
    
    float noiseVal = fbm(distortedUV * 8.0 + uTime * 0.2);
    
    vec3 waterColor = mix(uColorDeep, uColorShallow, depthFactor + noiseVal * 0.1);
    
    vec3 finalColor = waterColor;

    gl_FragColor = vec4(finalColor, alpha * 0.95);
}
`;

// Wave Sprite Vertex Shader (Standard quad)
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

// Wave Brush: Draws the initial "Stamp" of the wave
export const WAVE_BRUSH_FRAGMENT_SHADER = `
precision mediump float;
varying vec2 vUv;
varying float vAlpha;

float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
}

void main() {
    float xDist = abs(vUv.x - 0.5) * 2.0; 
    float xFade = smoothstep(1.0, 0.0, xDist);
    
    float y = vUv.y;
    
    float curve = (vUv.x - 0.5) * (vUv.x - 0.5) * 0.5;
    float yRel = vUv.y - curve; 
    
    float front = smoothstep(0.1, 0.3, yRel);
    float back = smoothstep(0.9, 0.3, yRel);
    
    float shape = front * back * xFade;
    
    float n = random(vUv * 10.0);
    shape *= (0.8 + 0.2 * n);
    
    gl_FragColor = vec4(shape * vAlpha, 0.0, 0.0, 1.0);
}
`;

// Simulation Shader: Handles Decay and Flow
export const SIMULATION_FRAGMENT_SHADER = `
precision mediump float;

uniform sampler2D uLastFrame;
uniform vec2 uResolution;
uniform float uDt;

void main() {
    vec2 uv = gl_FragCoord.xy / uResolution;
    
    vec2 offset = vec2(0.0, 0.003); 
    
    vec4 color = texture2D(uLastFrame, uv + offset);
    
    color *= 0.96; 
    
    float eps = 1.0 / uResolution.x;
    vec4 l = texture2D(uLastFrame, uv + offset + vec2(-eps, 0.0));
    vec4 r = texture2D(uLastFrame, uv + offset + vec2(eps, 0.0));
    
    color = mix(color, (l + r) * 0.5, 0.1);

    gl_FragColor = color;
}
`;
