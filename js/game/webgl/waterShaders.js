/* it's important that all literal comments in this file do not use the single line variant otherwise it will not compile correctly */
export const VERTEX_SHADER = `attribute vec2 position;
varying vec2 vUv;
void main() {
    vUv = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
}`;

/* --- BACKGROUND SHADER (Water Body) --- */
/* Renders the rolling ocean swells and sun glints. */
export const BACKGROUND_FRAGMENT_SHADER = `precision mediump float;

varying vec2 vUv;
uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uColorDeep;
uniform vec3 uColorShallow;

void main() {
    /* Wave animation settings */
    float speed = 3.0;
    float time = uTime * speed;
    
    /* Combine sine waves for a more natural look */
    /* vUv.x is 0..1 across the screen width */
    float wave1 = sin(vUv.x * 8.0 - time) * 0.04;
    float wave2 = sin(vUv.x * 15.0 - time * 0.6) * 0.02;
    float wave = wave1 + wave2;

    /* Define the shoreline height (baseline) */
    /* vUv.y=0 is bottom of canvas, vUv.y=1 is top */
    /* We want to discard pixels below this threshold */
    float threshold = 0.2 + wave; 

    if (vUv.y < threshold) {
        discard;
    }

    /* Recalculate gradient based on the new "bottom" */
    /* Map vUv.y from [threshold, 1.0] to [0.0, 1.0] */
    float gradientY = clamp((vUv.y - threshold) / (1.0 - threshold), 0.0, 1.0);
    
    vec3 col = mix(uColorShallow, uColorDeep, gradientY);
    
    /* Add a subtle "foam" or highlight at the edge */
    float edge = 1.0 - smoothstep(0.0, 0.04, vUv.y - threshold);
    col = mix(col, vec3(1.0, 1.0, 1.0), edge * 0.4);
    
    gl_FragColor = vec4(col, 1.0);
}`;

/* --- FOREGROUND SHADER (Waves/Surges) --- */
/* Renders the active game waves as complex volumetric surges with gradients. */
export const FRAGMENT_SHADER = `precision mediump float;

varying vec2 vUv;
uniform float uTime;
uniform vec2 uResolution;
uniform sampler2D uWaveMap; 
uniform vec3 uColorDeep;
uniform vec3 uColorShallow;
uniform vec3 uColorWaveDeep;  
uniform vec3 uColorWave;      

/* <--- FBM Noise Functions ---> */
float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f*f*(3.0-2.0*f);
    return mix(mix(hash(i + vec2(0.0,0.0)), hash(i + vec2(1.0,0.0)), u.x),
               mix(hash(i + vec2(0.0,1.0)), hash(i + vec2(1.0,1.0)), u.x), u.y);
}

/* Fractal Brownian Motion for detailed organic texture */
float fbm(vec2 p) {
    float total = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    /* 4 octaves of noise */
    for (int i = 0; i < 4; i++) {
        total += noise(p * frequency) * amplitude;
        frequency *= 2.0;
        amplitude *= 0.5;
    }
    return total;
}

void main() {
    vec2 uv = vUv;
    
    /* Sample the simulation (physics) */
    /* The red channel holds the "height" or "mass" of the wave */
    vec4 waveInfo = texture2D(uWaveMap, uv);
    float rawIntensity = waveInfo.r; 
    
    /* Cutoff for very low intensity to save performance/pixels */
    if (rawIntensity < 0.001) discard;
    
    /* <--- 1. Domain Distortion & Noise ---> */
    float distortion = fbm(uv * 10.0 + uTime * 0.5);
    float surfaceNoise = fbm(uv * 15.0 - vec2(0.0, uTime * 2.5)); /* Move texture down */
    
    /* <--- 2. Calculate Vertical Gradient (Slope) ---> */
    /* Wave moves DOWN (High Y to Low Y). */
    /* Leading Edge (Bottom): Intensity INCREASES as Y increases (from 0 below to 1 in wave). */
    /* Trailing Edge (Top): Intensity DECREASES as Y increases. */
    /* dIdy = current - below. */
    /* If positive, we are on the leading edge/slope. */
    /* If negative or zero, we are on the body or trailing edge. */
    
    float dStep = 1.0 / uResolution.y;
    float below = texture2D(uWaveMap, uv - vec2(0.0, dStep)).r;
    float dIdy = (rawIntensity - below) * 5.0; /* Boost gradient magnitude */
    
    /* <--- 3. Styling Logic ---> */
    
    /* A. Color Gradient */
    /* Leading Edge (positive gradient) -> Bright White (Foam) */
    /* Body/Trailing (neutral/negative) -> Deep Blue / Transparent */
    
    float foamSignal = smoothstep(0.0, 0.2, dIdy);
    float foamNoise = step(0.5, surfaceNoise);
    
    /* Base Body Color: Mix Deep and Shallow based on intensity, favoring Deep for the body */
    vec3 colBody = mix(uColorWaveDeep, uColorShallow, rawIntensity * 0.4);
    vec3 colFoam = uColorWave;
    
    /* Mix body and foam based on the gradient signal */
    vec3 finalColor = mix(colBody, colFoam, foamSignal * (0.8 + 0.2 * foamNoise));
    
    /* B. Opacity & Softness */
    /* "Center semi-transparent" -> Max alpha < 1.0 for body */
    /* "Leading edge bright white" -> Alpha 1.0 */
    /* "Trailing edge fade out" -> Alpha drops to 0 */

    /* Base Alpha: linear fade in from 0 */
    float baseAlpha = smoothstep(0.0, 1.0, rawIntensity); 
    
    /* Target Alpha: 0.5 (semi-transparent) at body, 1.0 at foam front */
    float targetAlpha = mix(0.5, 1.0, foamSignal);
    
    /* Soft Trailing Edge: Fade out where gradient is negative (back of wave) */
    /* dIdy < 0 implies we are on the top edge falling off. */
    /* Map dIdy [-0.1, 0.0] to Alpha [0.0, 1.0] */
    float backFade = smoothstep(-0.05, 0.0, dIdy);
    
    float finalAlpha = baseAlpha * targetAlpha * backFade;
    
    /* Clamp final alpha */
    finalAlpha = clamp(finalAlpha, 0.0, 1.0);

    /* <--- 4. Screen Fade ---> */
    /* Fade out at the very bottom and top to avoid hard clipping */
    float screenFade = smoothstep(0.0, 0.05, uv.y) * (1.0 - smoothstep(0.95, 1.0, uv.y));
    
    gl_FragColor = vec4(finalColor, finalAlpha * screenFade);
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
/* Spawns a new wave crest. */
/* Shape: Crescent (Convex bottom, concave top, horns up) */
export const WAVE_BRUSH_FRAGMENT_SHADER = `precision mediump float;
varying vec2 vUv;
varying float vAlpha;

void main() {
    vec2 p = vUv - 0.5;
    
    /* Flatten the coordinate system to make it wide */
    p = p / vec2(1.0, 0.5); 
    
    float r1 = 0.4;        /* Main circle radius */
    float r2 = 0.35;       /* Cutout circle radius */
    float shift = 0.15;    /* Shift cutout UP to remove top part */
    
    float d1 = length(p) - r1;
    float d2 = length(p - vec2(0.0, shift)) - r2;
    
    /* Intersect Main Circle with Outside of Cutout Circle */
    float d = max(d1, -d2);
    
    /* Smoothstep for anti-aliasing */
    /* Inside is negative. Boundary at 0. */
    float shape = smoothstep(0.02, 0.0, d);
    
    shape = clamp(shape, 0.0, 1.0);

    gl_FragColor = vec4(shape * vAlpha, 0.0, 0.0, 1.0);
}`;

/* --- SIMULATION SHADER --- */
/* Moves the waves down. */
export const SIMULATION_FRAGMENT_SHADER = `precision mediump float;

uniform sampler2D uLastFrame;
uniform vec2 uResolution;
uniform float uDt;

void main() {
    vec2 uv = gl_FragCoord.xy / uResolution;
    
    /* Flow Downwards */
    /* Speed: 8.0 pixels per frame (at sim res) */
    vec2 flow = vec2(0.0, 8.0 / uResolution.y); 
    
    vec2 sourceUv = uv + flow;

    if (sourceUv.y > 1.0) {
        gl_FragColor = vec4(0.0);
        return;
    }
    
    /* Horizontal Spread (Blur) */
    float spread = 1.0 / uResolution.x;
    
    vec4 center = texture2D(uLastFrame, sourceUv);
    vec4 left   = texture2D(uLastFrame, sourceUv - vec2(spread, 0.0));
    vec4 right  = texture2D(uLastFrame, sourceUv + vec2(spread, 0.0));
    
    /* Mix center with neighbors for diffusion */
    vec4 blurred = mix(center, (left + right) * 0.5, 0.1);
    
    /* Decay */
    gl_FragColor = blurred * 0.99;
}`;
