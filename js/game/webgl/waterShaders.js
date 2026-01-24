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
    
    /* <--- 1. Domain Distortion ---> */
    /* Distort the UVs slightly using noise to make the wave feel liquid */
    /* We scroll the noise over time */
    float distortion = fbm(uv * 10.0 + uTime * 0.5);
    
    /* <--- 2. Detailed Noise Texture ---> */
    /* Generate a detailed water surface texture */
    float surfaceNoise = fbm(uv * 15.0 - vec2(0.0, uTime * 2.5)); /* Move texture down */
    
    /* <--- 3. Shape the Wave Profile ---> */
    /* Combine raw intensity with noise. */
    /* High rawIntensity (center of wave) pushes through the noise. */
    /* Low rawIntensity (edges) gets broken up by noise. */
    float waveHeight = rawIntensity;
    
    /* Add some "choppiness" to the wave height based on the surface noise */
    /* stronger waves smooth out the noise (surface tension) */
    float detail = surfaceNoise * 0.3;
    float finalHeight = smoothstep(0.0, 1.0, waveHeight + detail * 0.5);
    
    /* <--- 4. Color Gradient Mixing ---> */
    /* We want a gradient: Deep Blue (Back) -> Turquoise (Body) -> White (Crest/Foam) */
    
    /* Base Transparency: The wave becomes more opaque as it gets taller */
    float alpha = smoothstep(0.02, 0.2, finalHeight);
    
    /* Mix 1: Deep Blue -> Turquoise */
    /* Occurs in the lower-mid range of height */
    float mix1 = smoothstep(0.1, 0.4, finalHeight);
    vec3 bodyColor = mix(uColorWaveDeep, uColorShallow, mix1);
    
    /* Mix 2: Turquoise -> White (Foam) */
    /* Occurs at the peak height */
    /* We use a sharper step to define the "foam cap" */
    float mix2 = smoothstep(0.6, 0.9, finalHeight);
    
    /* Add "foam bubbles" noise to the white cap */
    float foamTexture = step(0.6, surfaceNoise); /* binary noise for bubbles */
    float foamMix = mix(mix2, mix2 + foamTexture * 0.2, 0.5); /* blend uniform foam with bubbles */
    
    vec3 finalColor = mix(bodyColor, uColorWave, clamp(foamMix, 0.0, 1.0));
    
    /* <--- 5. Specular / Rim Light ---> */
    /* Fake a light source from top-left */
    float light = noise(uv * 40.0 + uTime);
    float rim = smoothstep(0.8, 0.95, finalHeight) * light;
    finalColor += vec3(0.8, 0.9, 1.0) * rim * 0.5;
    
    /* <--- 6. Edge/Shadow Definition ---> */
    /* Darken the trailing edge slightly for depth */
    /* Don't apply edge here because we discarded low intensity, */
    /* but we can darken the "low height" parts that remain */
    finalColor *= (0.8 + 0.2 * smoothstep(0.05, 0.2, rawIntensity));

    /* <--- 7. Screen Fade ---> */
    /* Fade out at the very bottom and top to avoid hard clipping */
    float screenFade = smoothstep(0.0, 0.05, uv.y) * (1.0 - smoothstep(0.95, 1.0, uv.y));
    
    gl_FragColor = vec4(finalColor, alpha * screenFade);
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
/* Shape: Wide Horizontal Bar/Ellipse (The crest of a wave) */
export const WAVE_BRUSH_FRAGMENT_SHADER = `precision mediump float;
varying vec2 vUv;
varying float vAlpha;

void main() {
    vec2 p = vUv - 0.5;
    
    /* Shape: Wide Horizontal Ellipse */
    /* width=0.4, height=0.08 */
    float d = length(p / vec2(1.0, 0.45)); 
    
    float shape = 1.0 - smoothstep(0.2, 0.35, d);
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
    
    vec4 center = texture2D(uLastFrame, sourceUv);
    
    /* Decay */
    gl_FragColor = center * 0.99;
}`;
