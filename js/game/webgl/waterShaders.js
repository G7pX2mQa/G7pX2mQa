// js/game/webgl/waterShaders.js

export const VERTEX_SHADER = `
attribute vec2 position;
varying vec2 vUv;
void main() {
    vUv = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
}
`;

// --- BACKGROUND SHADER (Water Body) ---
// Darker at top, clearer (transparent) at bottom.
// Slight wobble using noise/time.
// Updated to react to wave simulation and handle alpha better.
export const BACKGROUND_FRAGMENT_SHADER = `
precision mediump float;

varying vec2 vUv;
uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uColorDeep;
uniform vec3 uColorShallow;
uniform sampler2D uWaveMap;
uniform float uHeightRatio; // Ratio of BgHeight / FgHeight (e.g. 0.18)

// Simple noise for wobble
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

void main() {
    // 1. Remap UVs to match the Wave Simulation
    // Bg covers the top portion of the screen (e.g. 0 to 18%)
    // But in WebGL UVs (0 at bottom, 1 at top), this corresponds to the TOP slice.
    // So BgUV range [0, 1] maps to WaveUV range [1.0 - ratio, 1.0]
    float waveV = vUv.y * uHeightRatio + (1.0 - uHeightRatio);
    vec2 waveUv = vec2(vUv.x, waveV);

    // Sample Wave Map for distortion
    float waveVal = texture2D(uWaveMap, waveUv).r;

    // 2. Wobble logic + Wave Interaction
    float timeScale = uTime * 0.8;
    float wobbleX = sin(vUv.y * 12.0 + timeScale) * 0.008;
    float wobbleY = cos(vUv.x * 12.0 + timeScale) * 0.008;
    
    // Wave Push: Stronger push where waves are present
    vec2 wavePush = vec2(0.0, waveVal * 0.05);

    vec2 distortedUv = vUv + vec2(wobbleX, wobbleY) + wavePush;
    
    // Gradient Factor: 1.0 at Top, 0.0 at Bottom
    float depth = smoothstep(0.0, 1.0, distortedUv.y);
    
    // Color Mix
    // Deep color at top, Shallow color at bottom
    // Bias towards deep
    vec3 color = mix(uColorShallow, uColorDeep, smoothstep(0.2, 0.9, depth));
    
    // Alpha Mix
    // "Not white at the end" -> Keep it opaque or semi-opaque at the bottom
    // We keep alpha high to ensure the blue color is visible against the background.
    // Old: smoothstep(0.1, 0.8, depth + n * 0.05) -> Fades to 0.0
    // New: Blend from 0.8 (bottom) to 1.0 (top)
    float alpha = smoothstep(-0.5, 0.8, depth); 
    alpha = clamp(alpha, 0.85, 1.0); // Minimum opacity 0.85 to avoid "white" look
    
    gl_FragColor = vec4(color, alpha);
}
`;

// --- FOREGROUND SHADER (Waves/Surges) ---
// High speed, Foam at crests, Transparent elsewhere.
export const FRAGMENT_SHADER = `
precision mediump float;

varying vec2 vUv;
uniform float uTime;
uniform vec2 uResolution;
uniform sampler2D uWaveMap; 
uniform vec3 uColorDeep;
uniform vec3 uColorShallow;
uniform vec3 uColorFoam;

void main() {
    vec4 waveInfo = texture2D(uWaveMap, vUv);
    float waveVal = waveInfo.r; 
    
    // Threshold: Only draw if wave is strong enough
    if (waveVal < 0.05) {
        discard; // Fully transparent
    }
    
    // Calculate intensity for foam
    // "Waves should extend slightly past the water" -> handled by wave simulation propagation
    
    // Foam logic: High wave values = Foam
    float foamThreshold = 0.6;
    float isFoam = smoothstep(foamThreshold, foamThreshold + 0.1, waveVal);
    
    // Color
    // Mix between Shallow Blue and Foam White
    vec3 finalColor = mix(uColorShallow, uColorFoam, isFoam);
    
    // Alpha
    // Waves must be opaque enough to cover the coins (which are behind them)
    // "Waves should be fast enough to cover the coins for a while until they fade"
    float alpha = smoothstep(0.05, 0.4, waveVal); // Linear fade in
    alpha = clamp(alpha, 0.0, 1.0); // Ensure it hits 1.0 for opacity
    
    gl_FragColor = vec4(finalColor, alpha);
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
    
    // Shape logic: Curved wave front
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
// "Coins rushing in very quickly... violent" -> High speed flow
export const SIMULATION_FRAGMENT_SHADER = `
precision mediump float;

uniform sampler2D uLastFrame;
uniform vec2 uResolution;
uniform float uDt;

void main() {
    vec2 uv = gl_FragCoord.xy / uResolution;
    
    // Flow Vector: Moves waves DOWN rapidly
    // Increased offset for "Violent" speed
    // Old: 0.003 -> New: 0.008 -> Newer: 0.015
    vec2 flowOffset = vec2(0.0, 0.015); 
    
    vec4 color = texture2D(uLastFrame, uv + flowOffset);
    
    // Decay: Waves fade out over time
    // We want them to stick around long enough to cover coins, but not forever.
    // 0.98 is very slow decay. 0.95 is fast. 0.92 is faster.
    color *= 0.92; 
    
    // Diffusion (Blur/Spread)
    // Reduced diffusion to keep them "distinct"
    float eps = 1.0 / uResolution.x;
    vec4 l = texture2D(uLastFrame, uv + flowOffset + vec2(-eps, 0.0));
    vec4 r = texture2D(uLastFrame, uv + flowOffset + vec2(eps, 0.0));
    
    // Low mix factor = crisper edges
    color = mix(color, (l + r) * 0.5, 0.02); 

    gl_FragColor = color;
}
`;
