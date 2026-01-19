/* it's important that all literal comments in this file do not use the single line variant otherwise it will not compile correctly */
export const VERTEX_SHADER = `attribute vec2 position;
varying vec2 vUv;
void main() {
    vUv = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
}`;

// --- BACKGROUND SHADER (Water Body) ---
// Darker at top, clearer (transparent) at bottom.
// Slight wobble using noise/time.
export const BACKGROUND_FRAGMENT_SHADER = `precision mediump float;

varying vec2 vUv;
uniform float uTime;
uniform vec2 uResolution;
uniform sampler2D uWaveMap; /* NEW: Receive wave data for distortion */
uniform vec3 uColorDeep;
uniform vec3 uColorShallow;

/* Simple noise for wobble */
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
    /* Wave Influence ("Jolt") */
    /* Read the wave map to see where active waves are. */
    vec4 waveInfo = texture2D(uWaveMap, vUv);
    /* Strength of the jolt/distortion based on wave intensity */
    float waveDistort = waveInfo.r * 0.02; 
    
    vec2 distortedUv = vUv;
    /* Push/Bulge effect: waves push texture outwards/downwards */
    distortedUv.x += waveDistort * 0.5; 
    distortedUv.y += waveDistort; 
    
    /* Standard wobble */
    float timeScale = uTime * 0.5;
    float waveX = sin(distortedUv.y * 10.0 + timeScale) * 0.005;
    float waveY = cos(distortedUv.x * 10.0 + timeScale) * 0.005;
    distortedUv += vec2(waveX, waveY);
    
    /* Gradient Logic */
    /* "Water ends shortly down from the top" */
    /* 1.0 is Top, 0.0 is Bottom. */
    float depth = smoothstep(0.0, 1.0, distortedUv.y);
    
    /* Cutoff: Transparency starts around y=0.7 */
    /* smoothstep(0.6, 0.9, depth) means: */
    /* Below 0.6: Alpha 0 (Sand) */
    /* 0.6 to 0.9: Fade */
    /* Above 0.9: Alpha 1 (Deep Water) */
    float waterBody = smoothstep(0.65, 0.95, depth);
    
    /* Color Mix */
    vec3 color = mix(uColorShallow, uColorDeep, smoothstep(0.75, 1.0, depth));
    
    /* Add "Jolt" highlight: brighten water slightly where waves are */
    color += uColorShallow * waveInfo.r * 0.3;

    /* Alpha Mix */
    /* Add some noise to the shoreline edge */
    float n = noise(vUv * 10.0 + vec2(uTime * 0.2));
    float alpha = smoothstep(0.0, 1.0, waterBody + n * 0.02);
    
    gl_FragColor = vec4(color, alpha);
}`;

// --- FOREGROUND SHADER (Waves/Surges) ---
// High speed, Foam at crests, Transparent elsewhere.
export const FRAGMENT_SHADER = `precision mediump float;

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
    
    /* Threshold: Only draw if wave is strong enough */
    if (waveVal < 0.05) {
        discard; /* Fully transparent */
    }
    
    /* Foam logic: High wave values = Foam */
    float foamThreshold = 0.5;
    float isFoam = smoothstep(foamThreshold, foamThreshold + 0.2, waveVal);
    
    /* Color */
    /* Mix between Shallow Blue and Foam White */
    vec3 finalColor = mix(uColorShallow, uColorFoam, isFoam);
    
    /* Alpha */
    float alpha = smoothstep(0.05, 0.4, waveVal); 
    alpha = clamp(alpha, 0.0, 0.85); /* Slightly transparent waves */
    
    gl_FragColor = vec4(finalColor, alpha);
}`;

// Wave Sprite Vertex Shader (Standard quad)
export const WAVE_VERTEX_SHADER = `attribute vec2 aPosition;
attribute vec2 aUv;
attribute float aAlpha; 

varying vec2 vUv;
varying float vAlpha;

void main() {
    vUv = aUv;
    vAlpha = aAlpha;
    gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

// Wave Brush: Draws the initial "Stamp" of the wave
// Redesigned: Horizontal Wave Front
export const WAVE_BRUSH_FRAGMENT_SHADER = `precision mediump float;
varying vec2 vUv;
varying float vAlpha;

float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
}

void main() {
    /* 1. Horizontal Shape (Wide X) */
    float xDist = abs(vUv.x - 0.5) * 2.0; 
    /* Smooth fade at the edges of the brush stamp */
    float xFade = smoothstep(1.0, 0.5, xDist);
    
    /* 2. Wave Front (Y axis) */
    /* Sharp front, trailing back */
    float y = vUv.y;
    /* Slight curve to look natural */
    float curve = (vUv.x - 0.5) * (vUv.x - 0.5) * 0.3;
    float yRel = y - curve;
    
    /* Front edge (leading edge of the wave) */
    float front = smoothstep(0.1, 0.2, yRel);
    /* Back edge (trailing foam) */
    float back = smoothstep(0.7, 0.2, yRel);
    
    float shape = front * back * xFade;
    
    /* Noise/Texture */
    float n = random(vUv * 20.0);
    shape *= (0.6 + 0.4 * n);
    
    gl_FragColor = vec4(shape * vAlpha, 0.0, 0.0, 1.0);
}`;

// Simulation Shader: Handles Decay and Flow
// "Waves sort of fade out and quickly"
// "Push other water outward"
export const SIMULATION_FRAGMENT_SHADER = `precision mediump float;

uniform sampler2D uLastFrame;
uniform vec2 uResolution;
uniform float uDt;

void main() {
    vec2 uv = gl_FragCoord.xy / uResolution;
    
    /* Flow Vector: Moves waves DOWN */
    vec2 flowOffset = vec2(0.0, 0.008); 
    
    vec4 color = texture2D(uLastFrame, uv + flowOffset);
    
    /* Decay: Waves fade out quickly */
    color *= 0.94; 
    
    /* Diffusion (Spread Outward) */
    /* Increased spread to simulate "pushing" */
    float eps = 1.0 / uResolution.x;
    vec4 l = texture2D(uLastFrame, uv + flowOffset + vec2(-eps * 3.0, 0.0)); /* Look further sideways */
    vec4 r = texture2D(uLastFrame, uv + flowOffset + vec2(eps * 3.0, 0.0));
    
    /* Mix neighbors */
    color = mix(color, (l + r) * 0.5, 0.15); 

    gl_FragColor = color;
}`;
