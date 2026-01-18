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
    // 1. Sample Wave Map
    // We sample center and neighbors to get normals
    vec4 waveInfo = texture2D(uWaveMap, vUv);
    float waveVal = waveInfo.r; // Intensity
    
    // 2. Coordinate setup
    // vUv.y = 1.0 at Top.
    // distFromTop: 0.0 (Top) -> 1.0 (Bottom)
    float distFromTop = 1.0 - vUv.y;
    
    // 3. Define Water Edge
    // The "Shoreline" is defined by a base level + wave intensity pushing it down.
    // Base level: How far down the screen the calm water extends (e.g., 0.18 = 18% down)
    float baseLevel = 0.02; 
    
    // Wave influence: Waves push the edge further down.
    // scale waveVal to a screen-percentage displacement.
    float wavePush = waveVal * 0.80; 
    
    float waterEdge = baseLevel + wavePush;
    
    // 4. Alpha Mask (The Cutoff)
    // We want opaque water above the edge, transparent below.
    // Use a small smoothstep for anti-aliasing but keep it sharp.
    float edgeSoftness = 0.01;
    // If distFromTop < waterEdge -> water
    // distFromTop > waterEdge -> dry
    // smoothstep(waterEdge - edgeSoftness, waterEdge, distFromTop) goes 0->1 at the edge
    // We want 1->0
    float alpha = 1.0 - smoothstep(waterEdge - edgeSoftness, waterEdge, distFromTop);
    
    if (alpha < 0.01) {
        // Discarding can save fill rate, but setting alpha to 0 is also fine.
        gl_FragColor = vec4(0.0);
        return;
    }

    // 5. Water Surface Color
    // Mix Deep (Top) to Shallow (Near Edge)
    // Normalize distFromTop against the current waterEdge to get a 0.0-1.0 gradient within the water body
    // Avoid divide by zero
    float safeEdge = max(waterEdge, 0.001);
    float depthFactor = clamp(distFromTop / safeEdge, 0.0, 1.0);
    
    // Distortion from waves for the noise lookup
    float eps = 2.0 / uResolution.x;
    float hRight = texture2D(uWaveMap, vUv + vec2(eps, 0.0)).r;
    float hUp    = texture2D(uWaveMap, vUv + vec2(0.0, eps)).r;
    vec2 distortion = vec2(waveVal - hRight, waveVal - hUp) * 4.0;
    
    // Base Water Pattern (FBM)
    vec2 st = gl_FragCoord.xy / uResolution.xy;
    vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
    vec2 uv = st * aspect;
    vec2 distortedUV = uv + distortion * 0.05;
    
    // FBM Noise for water surface
    float noiseVal = fbm(distortedUV * 8.0 + uTime * 0.2);
    
    // Mix Colors
    // calm deep water at top, shallow at bottom, modulated by noise
    vec3 waterColor = mix(uColorDeep, uColorShallow, depthFactor + noiseVal * 0.1);
    
    // 6. No Foam (User Request)
    // Just use the base water color
    vec3 finalColor = waterColor;

    gl_FragColor = vec4(finalColor, alpha * 0.95);
}
`;

// Wave Sprite Vertex Shader (Standard quad)
export const WAVE_VERTEX_SHADER = `
attribute vec2 aPosition;
attribute vec2 aUv;
attribute float aAlpha; // Not strictly used if we just draw fresh, but kept for compatibility

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
    // We want a "Wave Front" shape.
    // Center 0.5.
    // Shape: Horizontal arc, fading at sides, sharp at bottom (leading edge), soft at top (trailing edge).
    
    // 1. Horizontal Fade (Sides)
    float xDist = abs(vUv.x - 0.5) * 2.0; // 0 to 1
    float xFade = smoothstep(1.0, 0.0, xDist);
    
    // 2. Vertical Profile
    // We want it to look like it's crashing DOWN.
    // Bottom (y=1 in texture? No, y=0 is usually bottom in UVs, but let's check orientation).
    // Let's assume standard UV: 0,0 bottom-left.
    // We want the "Front" to be at the bottom or top depending on motion.
    // User said "crashing in from top".
    // So the wave should visually look like the leading edge is at the bottom (moving down).
    
    float y = vUv.y;
    
    // Sharp leading edge at bottom (near 0), soft trailing edge at top (near 1)
    // Actually, let's center it vertically so we don't clip.
    
    // Curve: Bend the y slightly based on x to give it a "C" or "U" shape?
    // A slight "U" shape (sides higher) looks like a wave front.
    float curve = (vUv.x - 0.5) * (vUv.x - 0.5) * 0.5;
    float yRel = vUv.y - curve; // Adjusted Y
    
    // Main Intensity Profile
    // Peak around 0.3, fade up to 1.0, sharp cut below 0.2
    float front = smoothstep(0.1, 0.3, yRel);
    float back = smoothstep(0.9, 0.3, yRel);
    
    float shape = front * back * xFade;
    
    // Add some noise for "foam" / "water" texture
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
    
    // Flow/Drift Logic
    // "Crashing in from top" -> Waves should move DOWN screen.
    // To move content DOWN, we sample UP (y + offset).
    vec2 offset = vec2(0.0, 0.003); // Drift speed
    
    // Sample
    vec4 color = texture2D(uLastFrame, uv + offset);
    
    // Decay
    // Fade out over time.
    color *= 0.96; 
    
    // Optional: Horizontal spread (diffusion) to make it ripple?
    // Simple 3-tap blur on X
    float eps = 1.0 / uResolution.x;
    vec4 l = texture2D(uLastFrame, uv + offset + vec2(-eps, 0.0));
    vec4 r = texture2D(uLastFrame, uv + offset + vec2(eps, 0.0));
    
    // Slight blur integration
    color = mix(color, (l + r) * 0.5, 0.1);

    gl_FragColor = color;
}
`;
