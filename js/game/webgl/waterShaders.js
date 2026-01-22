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
    /* Simple vertical gradient from Deep (top) to Shallow (bottom) */
    vec3 col = mix(uColorShallow, uColorDeep, vUv.y);
    
    gl_FragColor = vec4(col, 1.0);
}`;

/* --- FOREGROUND SHADER (Waves/Surges) --- */
/* Renders the active game waves as Foam/Whitecaps. */
export const FRAGMENT_SHADER = `precision mediump float;

varying vec2 vUv;
uniform float uTime;
uniform vec2 uResolution;
uniform sampler2D uWaveMap; 
uniform vec3 uColorDeep;
uniform vec3 uColorShallow;
uniform vec3 uColorWaveDeep;  
uniform vec3 uColorWave;      

/* Simple noise for foam breakup */
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

void main() {
    vec2 uv = vUv;
    
    /* Sample the simulation (physics) */
    vec4 waveInfo = texture2D(uWaveMap, uv);
    float intensity = waveInfo.r; 
    
    if (intensity < 0.01) discard;
    
    /* Create Foam Texture */
    /* Move noise opposite to wave direction slightly for turbulence */
    float foamNoise = noise(uv * 20.0 + vec2(0.0, uTime * 0.5));
    
    /* Erode the intensity with noise */
    float foam = intensity - (foamNoise * 0.2);
    foam = smoothstep(0.2, 0.5, foam);
    
    /* Color: White Foam + Light Blue tint */
    vec3 foamColor = vec3(0.95, 0.98, 1.0); /* Bright White-Blue */
    
    /* Add a shadow/edge outline */
    float outline = smoothstep(0.0, 0.2, intensity) - smoothstep(0.2, 0.5, intensity);
    vec3 outlineColor = uColorShallow * 0.8;
    
    /* Final Mix */
    /* Mostly foam color, fading out */
    vec3 finalColor = foamColor;
    
    /* Alpha Fade */
    float alpha = foam * smoothstep(0.0, 0.2, intensity);
    
    /* Positional Fade (Top/Bottom of screen) */
    float screenFade = smoothstep(0.0, 0.1, uv.y) * (1.0 - smoothstep(0.9, 1.0, uv.y));
    
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
    float d = length(p / vec2(1.0, 0.2)); 
    
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
    /* Speed: 2.0 pixels per frame (at sim res) */
    vec2 flow = vec2(0.0, 2.0 / uResolution.y); 
    
    vec2 sourceUv = uv + flow;

    if (sourceUv.y > 1.0) {
        gl_FragColor = vec4(0.0);
        return;
    }
    
    vec4 center = texture2D(uLastFrame, sourceUv);
    
    /* Decay */
    gl_FragColor = center * 0.99;
}`;
