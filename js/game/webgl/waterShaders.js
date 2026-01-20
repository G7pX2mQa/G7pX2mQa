/* it's important that all literal comments in this file do not use the single line variant otherwise it will not compile correctly */
export const VERTEX_SHADER = `attribute vec2 position;
varying vec2 vUv;
void main() {
    vUv = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
}`;

/* --- BACKGROUND SHADER (Water Body) --- */
/* Renders the water volume, caustics, and shoreline. */
/* Sits BEHIND the coins. */
export const BACKGROUND_FRAGMENT_SHADER = `precision mediump float;

varying vec2 vUv;
uniform float uTime;
uniform vec2 uResolution;
uniform sampler2D uWaveMap; 
uniform vec3 uColorDeep;
uniform vec3 uColorShallow;

/* Pseudo-random */
float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

/* Value Noise */
float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f*f*(3.0-2.0*f);
    return mix(mix(hash(i + vec2(0.0,0.0)), hash(i + vec2(1.0,0.0)), u.x),
               mix(hash(i + vec2(0.0,1.0)), hash(i + vec2(1.0,1.0)), u.x), u.y);
}

/* Caustics Pattern: Layered noise moving at different speeds */
float caustics(vec2 uv, float t) {
    float n1 = noise(uv * 12.0 + vec2(t * 0.5, t * 0.9));
    float n2 = noise(uv * 15.0 - vec2(t * 0.4, t * 0.2));
    return pow(min(n1, n2), 2.0) * 3.0; /* Sharpen intersects */
}

void main() {
    /* Sample Wave Simulation for distortion */
    vec4 waveInfo = texture2D(uWaveMap, vUv);
    float waveH = waveInfo.r; 
    
    /* Distort UVs for the seabed/caustics based on wave height (Refraction) */
    vec2 uv = vUv;
    uv += vec2(waveH * 0.02, waveH * 0.01);
    
    /* Calculate Water Depth/Shoreline */
    /* Y=1 is Top, Y=0 is Bottom. Water is at the top. */
    /* Shoreline is roughly at 0.82 (18% from top) */
    
    /* Add noise to shoreline edge */
    float edgeNoise = noise(vec2(uv.x * 10.0, uTime * 0.5));
    
    /* Target Top 15% (0.85). */
    float shoreY = 0.85 + edgeNoise * 0.015;
    
    /* 0.0 = Dry Sand, 1.0 = Deep Water */
    float waterMask = smoothstep(shoreY - 0.02, shoreY + 0.05, uv.y);
    
    if (waterMask < 0.01) {
        discard; /* Optimization */
    }

    /* Color Gradient */
    /* Mix Shallow -> Deep based on Y */
    float depthGradient = smoothstep(shoreY, 1.0, uv.y);
    vec3 color = mix(uColorShallow, uColorDeep, depthGradient);
    
    /* Add Caustics */
    float cau = caustics(uv, uTime);
    color += vec3(0.8, 0.9, 1.0) * cau * 0.15 * waterMask;
    
    /* Darken under waves (Fake Ambient Occlusion from the waves above) */
    color -= vec3(0.2) * waveH;
    
    /* Alpha */
    float alpha = waterMask * 0.9; /* Slightly transparent */
    
    gl_FragColor = vec4(color, alpha);
}`;

/* --- FOREGROUND SHADER (Waves/Surges) --- */
/* Renders the waves, foam, and highlights. */
/* Sits ON TOP of the coins. */
export const FRAGMENT_SHADER = `precision mediump float;

varying vec2 vUv;
uniform float uTime;
uniform vec2 uResolution;
uniform sampler2D uWaveMap; 
uniform vec3 uColorDeep;
uniform vec3 uColorShallow;
uniform vec3 uColorFoam;

void main() {
    vec2 uv = vUv;
    vec4 waveInfo = texture2D(uWaveMap, uv);
    float waveVal = waveInfo.r; 
    
    /* Thresholds */
    if (waveVal < 0.0001) {
        discard; 
    }
    
    /* 1. Wave Body (Translucent Blue) */
    /* Fades out via alpha as waveVal decreases */
    /* Raised threshold from 0.0001 to 0.2 to cut off trails faster */
    float waveBodyAlpha = smoothstep(0.2, 0.5, waveVal);
    vec3 waveColor = mix(uColorShallow, uColorDeep, 0.2); /* Mostly shallow color */
    
    /* 2. Specular Highlight (Fake Lighting) */
    /* Estimate Gradient */
    float eps = 1.0 / 256.0; /* Sim resolution approximation */
    float hL = texture2D(uWaveMap, uv + vec2(-eps, 0.0)).r;
    float hR = texture2D(uWaveMap, uv + vec2(eps, 0.0)).r;
    float hU = texture2D(uWaveMap, uv + vec2(0.0, eps)).r;
    float hD = texture2D(uWaveMap, uv + vec2(0.0, -eps)).r;
    
    vec3 normal = normalize(vec3(hL - hR, hD - hU, 0.2)); /* Arbitrary Z */
    vec3 lightDir = normalize(vec3(-0.5, -0.5, 1.0)); /* Top-Left Sun */
    float specular = pow(max(dot(normal, lightDir), 0.0), 4.0);
    
    /* 3. Foam (White Crests) */
    /* Foam appears at high wave values and trailing edges */
    float foamThreshold = 0.45;
    float isFoam = smoothstep(foamThreshold, foamThreshold + 0.1, waveVal);
    
    /* Add noise to foam to break it up */
    /* Simple hash based on UV */
    float n = fract(sin(dot(uv * 100.0, vec2(12.9898,78.233))) * 43758.5453);
    isFoam *= (0.8 + 0.4 * n);

    /* Combine */
    vec3 finalColor = mix(waveColor, uColorFoam, isFoam);
    
    /* Add Specular (only on water, less on foam) */
    finalColor += vec3(1.0) * specular * 0.5 * (1.0 - isFoam);
    
    /* Final Alpha */
    float finalAlpha = waveBodyAlpha * 0.8; /* Base transparency */
    finalAlpha += isFoam * 0.2; /* Foam is more opaque */
    finalAlpha = clamp(finalAlpha, 0.0, 0.95);

    /* POSITIONAL FADE: Fade out as wave moves down the screen */
    /* uv.y goes from 0 (bottom) to 1 (top). */
    /* Fade out in the bottom 40% of the screen. */
    float positionalFade = smoothstep(0.0, 0.4, uv.y);
    finalAlpha *= positionalFade;
    
    gl_FragColor = vec4(finalColor, finalAlpha);
}`;

/* Wave Sprite Vertex Shader (Standard quad) */
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

/* --- BRUSH SHADER --- */
/* Draws the initial shape of a new wave. */
/* Redesigned: A smooth "Drop" or "Capsule" shape that looks natural. */
export const WAVE_BRUSH_FRAGMENT_SHADER = `precision mediump float;
varying vec2 vUv;
varying float vAlpha;

void main() {
    /* Center (0.5, 0.5) */
    vec2 p = vUv - 0.5;
    
    /* Shape: Wide Oval / Capsule */
    /* Stretching X to simulate a wide wave front */
    float dist = length(vec2(p.x * 0.25, p.y)); 
    
    /* Smooth Drop: 1.0 at center, 0.0 at edge */
    float shape = smoothstep(0.5, 0.0, dist);
    
    /* Bias towards the front? (Bottom) */
    /* To make it look like a rolling wave front, we can sharpen the bottom edge */
    /* But simpler is often better for simulation inputs */
    
    shape = pow(shape, 1.5); /* sharpen curve */

    gl_FragColor = vec4(shape * vAlpha, 0.0, 0.0, 1.0);
}`;

/* --- SIMULATION SHADER --- */
/* Handles the physics: Advection (Movement), Diffusion (Spread), Decay. */
export const SIMULATION_FRAGMENT_SHADER = `precision mediump float;

uniform sampler2D uLastFrame;
uniform vec2 uResolution;
uniform float uDt;

void main() {
    vec2 uv = gl_FragCoord.xy / uResolution;
    vec2 pixel = 1.0 / uResolution;
    
    /* 1. Advection (Flow Downwards) */
    /* Move sample point UP to simulate flow DOWN */
    vec2 flow = vec2(0.0, 0.007); 
    
    /* 2. Diffusion (Blur/Spread) */
    /* Sample neighbors to spread the wave out laterally */
    vec4 center = texture2D(uLastFrame, uv + flow);
    vec4 left   = texture2D(uLastFrame, uv + flow + vec2(-pixel.x, 0.0));
    vec4 right  = texture2D(uLastFrame, uv + flow + vec2(pixel.x, 0.0));
    vec4 up     = texture2D(uLastFrame, uv + flow + vec2(0.0, pixel.y));
    /* vec4 down   = texture2D(uLastFrame, uv + flow + vec2(0.0, -pixel.y)); */
    
    /* Simple Gaussian-ish blur */
    /* Bias blur downwards by reading from UP. */
    /* Propagating from UP to Center moves info DOWN. Matches flow. */
    vec4 blurred = (center * 0.4) + ((left + right + up) * 0.2);
    
    /* 3. Decay */
    /* Waves lose energy over time */
    /* Increased decay to prevent waterfall artifacts (0.99 -> 0.96) */
    blurred *= 0.96; 
    
    gl_FragColor = blurred;
}`;
