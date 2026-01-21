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
uniform vec3 uColorWave;      /* Turquoise (Front) */
uniform vec3 uColorWaveDeep;  /* Deep Blue (Back) */

void main() {
    vec2 uv = vUv;
    vec4 waveInfo = texture2D(uWaveMap, uv);
    float waveVal = waveInfo.r; 
    
    /* Thresholds */
    if (waveVal < 0.0001) {
        discard; 
    }
    
    /* Gradient Calculation for Front/Back detection */
    /* Use finite difference to find vertical slope */
    float eps = 1.0 / 256.0; 
    float hU = texture2D(uWaveMap, uv + vec2(0.0, eps)).r;
    float hD = texture2D(uWaveMap, uv - vec2(0.0, eps)).r;
    
    /* Positive dHdy means Height increases as Y increases. */
    /* With waves moving down (Tail Top, Head Bottom): */
    /* Moving UP (increasing Y) goes from Head (0->1) to Tail (1->0). */
    /* So Leading Edge (Bottom) has Positive Slope. */
    /* Trailing Edge (Top) has Negative Slope. */
    float dHdy = (hU - hD); 

    /* 1. Base Color Gradient */
    /* Map dHdy to mix factor. Front(Pos) -> Light, Back(Neg) -> Deep */
    /* Widen range significantly for a smooth body gradient instead of a hard split */
    float gradMix = smoothstep(-0.3, 0.3, dHdy);
    vec3 waveColor = mix(uColorWaveDeep, uColorWave, gradMix);
    
    /* 2. Foam (Leading Edge Only) */
    /* Needs high positive slope (Steep Front) */
    /* Soften the threshold */
    float foamSignal = smoothstep(0.05, 0.25, dHdy);
    
    /* "Froth" Noise: Time-based wobble */
    float n = fract(sin(dot(uv * 40.0 + vec2(0.0, uTime * 2.0), vec2(12.9898,78.233))) * 43758.5453);
    float foamNoise = smoothstep(0.0, 1.0, n); /* Full range noise */
    
    /* Combine Signal and Noise */
    /* Blend softly */
    float isFoam = smoothstep(0.2, 0.9, foamSignal * (0.6 + 0.4 * foamNoise));
    
    /* Mask foam to wave body */
    isFoam *= smoothstep(0.1, 0.5, waveVal);

    /* 3. Specular Highlight (Fake Lighting) */
    float hL = texture2D(uWaveMap, uv + vec2(-eps, 0.0)).r;
    float hR = texture2D(uWaveMap, uv + vec2(eps, 0.0)).r;
    
    vec3 normal = normalize(vec3(hL - hR, hD - hU, 0.2)); 
    vec3 lightDir = normalize(vec3(-0.5, -0.5, 1.0)); 
    float specular = pow(max(dot(normal, lightDir), 0.0), 16.0);
    
    /* Final Color Mix */
    vec3 finalColor = mix(waveColor, uColorFoam, isFoam); 
    
    /* Add Specular (masked by foam) */
    finalColor += vec3(1.0) * specular * 0.1 * (1.0 - isFoam);
    
    /* Final Alpha */
    float finalAlpha = waveVal * 0.95; 
    
    /* POSITIONAL FADE: Fade out as wave moves down the screen */
    float positionalFade = smoothstep(0.70, 0.80, uv.y);
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
/* Redesigned: Vertical Teardrop with Concave Top. */
export const WAVE_BRUSH_FRAGMENT_SHADER = `precision mediump float;
varying vec2 vUv;
varying float vAlpha;

void main() {
    /* Center (0.5, 0.5) */
    vec2 p = vUv - 0.5;
    
    /* Shape: Vertical Teardrop */
    /* Head (Bottom, y < 0), Tail (Top, y > 0) */
    
    float r = 0.22;
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
    
    float shape = 1.0 - smoothstep(0.0, 0.01, d);
    
    /* Concave Dip (Saddle) at Top Crest */
    /* Subtract a circular notch from the tip */
    float notchY = tailLen; 
    float notchR = 0.15;
    vec2 notchPos = vec2(0.0, notchY);
    float notchDist = length(p - notchPos);
    
    /* Carve out the notch */
    float notchMask = smoothstep(notchR - 0.02, notchR + 0.02, notchDist);
    shape *= notchMask;
    
    /* Bias/Sharpen */
    shape = clamp(shape, 0.0, 1.0);
    shape = pow(shape, 1.5); 

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
    
    vec2 sourceUv = uv + flow;

    /* Boundary Check */
    if (sourceUv.y > 1.0) {
        gl_FragColor = vec4(0.0);
        return;
    }
    
    vec4 center = texture2D(uLastFrame, sourceUv);
    
    gl_FragColor = center;
}`;
