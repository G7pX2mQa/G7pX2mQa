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

/* Manual Bilinear Filtering for uWaveMap (512x512) */
/* Essential if OES_texture_float_linear is missing on device */
vec4 sampleWave(sampler2D tex, vec2 uv) {
    vec2 res = vec2(512.0);
    vec2 st = uv * res - 0.5;
    vec2 i = floor(st);
    vec2 f = fract(st);
    
    vec4 a = texture2D(tex, (i + vec2(0.5, 0.5)) / res);
    vec4 b = texture2D(tex, (i + vec2(1.5, 0.5)) / res);
    vec4 c = texture2D(tex, (i + vec2(0.5, 1.5)) / res);
    vec4 d = texture2D(tex, (i + vec2(1.5, 1.5)) / res);
    
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

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
    /* Sample Wave Simulation for distortion using Manual Bilinear */
    vec4 waveInfo = sampleWave(uWaveMap, vUv);
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
export const FRAGMENT_SHADER = `precision highp float;

varying vec2 vUv;
uniform float uTime;
uniform vec2 uResolution;
uniform sampler2D uWaveMap; 
uniform vec3 uColorDeep;
uniform vec3 uColorShallow;
uniform vec3 uColorWaveDeep;  /* Deep Blue (Back) */
uniform vec3 uColorWave;      /* Light Blue (Highlights/Crumple) */

/* Manual Bilinear Filtering for uWaveMap (512x512) */
vec4 sampleWave(sampler2D tex, vec2 uv) {
    vec2 res = vec2(512.0);
    vec2 st = uv * res - 0.5;
    vec2 i = floor(st);
    vec2 f = fract(st);
    
    vec4 a = texture2D(tex, (i + vec2(0.5, 0.5)) / res);
    vec4 b = texture2D(tex, (i + vec2(1.5, 0.5)) / res);
    vec4 c = texture2D(tex, (i + vec2(0.5, 1.5)) / res);
    vec4 d = texture2D(tex, (i + vec2(1.5, 1.5)) / res);
    
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

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

void main() {
    vec2 uv = vUv;
    vec4 waveInfo = sampleWave(uWaveMap, uv);
    float waveVal = waveInfo.r; 
    
    /* Thresholds */
    if (waveVal < 0.0001) {
        discard; 
    }
    
    /* Generate Crumpled Texture Pattern */
    /* Scale UVs for noise frequency */
    vec2 noiseUV = uv * 8.0; 
    
    /* Animate noise */
    noiseUV += vec2(uTime * 0.3, uTime * 0.1);
    
    /* Layered Ridge Noise for crumple effect (Lines) */
    /* Ridge = 1.0 - abs(noise * 2 - 1) */
    
    float n1 = noise(noiseUV);
    float ridge1 = 1.0 - abs(n1 * 2.0 - 1.0);
    
    float n2 = noise(noiseUV * 2.5 + vec2(uTime * 0.2));
    float ridge2 = 1.0 - abs(n2 * 2.0 - 1.0);
    
    /* Combine ridges to get intersecting lines */
    /* Multiplying them creates a 'cell' like structure, averaging makes it messy. */
    /* Let's try average but sharpened */
    float crumple = (ridge1 + ridge2) * 0.5;
    
    /* Sharpen the ridges to make them look like crease lines */
    /* High power makes the peaks narrower */
    crumple = pow(crumple, 4.0);
    
    /* Invert so lines are the feature? Or keep peaks as lines? */
    /* Usually creases catch light. Let's make peaks light color. */
    
    /* Contrast enhancement */
    crumple = smoothstep(0.1, 0.6, crumple);

    /* Mix Colors */
    /* Base is Deep Blue, Add Light Blue based on crumple lines */
    vec3 waveColor = mix(uColorWaveDeep, uColorWave, crumple);
    
    /* Final Color Mix (No Specular) */
    vec3 finalColor = waveColor;
    
    /* Final Alpha */
    /* Make wave fully opaque in center */
    float finalAlpha = smoothstep(0.0, 0.1, waveVal); 
    
    /* REMOVED POSITIONAL FADE to ensure full opacity as requested by user. */
    /* The wave will be fully opaque until it disappears from simulation. */
    
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
/* Redesigned: Vertical Teardrop with Concave Top. */
/* NOW SOFTENED to prevent hard outline artifacts in gradient. */
export const WAVE_BRUSH_FRAGMENT_SHADER = `precision mediump float;
varying vec2 vUv;
varying float vAlpha;

void main() {
    /* Center (0.5, 0.5) */
    vec2 p = vUv - 0.5;
    
    /* Shape: Vertical Teardrop */
    /* Head (Bottom, y < 0), Tail (Top, y > 0) */
    
    /* Increased radius slightly to compensate for soft fade */
    float r = 0.25;
    float tailLen = 0.35;
    
    float d = 0.0;
    
    if (p.y <= 0.0) {
        /* Round Head */
        d = length(p) - r;
    } else {
        /* Tapered Tail */
        float w = r * (1.0 - smoothstep(0.0, tailLen, p.y));
        d = abs(p.x) - w;
    }
    
    /* SOFT EDGE: Transition over 0.2 units instead of 0.01 */
    /* This creates a pillow-like heightmap instead of a plateau */
    float shape = 1.0 - smoothstep(0.0, 0.20, d);
    
    /* Simple smooth shape - no notches or sharpening */
    shape = clamp(shape, 0.0, 1.0);

    gl_FragColor = vec4(shape * vAlpha, 0.0, 0.0, 1.0);
}`;

/* --- SIMULATION SHADER --- */
/* Handles the physics: Advection (Movement), Diffusion (Spread), Decay. */
export const SIMULATION_FRAGMENT_SHADER = `precision highp float;

uniform sampler2D uLastFrame;
uniform vec2 uResolution;
uniform float uDt;

void main() {
    vec2 uv = gl_FragCoord.xy / uResolution;
    vec2 pixel = 1.0 / uResolution;
    
    /* 1. Advection (Flow Downwards) */
    /* Move sample point UP to simulate flow DOWN */
    /* Snapped to integer pixels (4px) to prevent sub-pixel banding artifacts */
    vec2 flow = vec2(0.0, 4.0 / uResolution.y); 
    
    vec2 sourceUv = uv + flow;

    /* Boundary Check */
    if (sourceUv.y > 1.0) {
        gl_FragColor = vec4(0.0);
        return;
    }
    
    vec4 center = texture2D(uLastFrame, sourceUv);
    
    /* Apply decay to replicate the fading behavior that was previously */
    /* a side-effect of mediump precision loss. */
    /* INCREASED to 0.992 to reduce quantization banding on 8-bit textures */
    gl_FragColor = center * 0.992;
}`;
