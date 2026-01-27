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
    float speed = 1.2;
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
    /* Wave Logic */
    vec2 waveUV = uv - vec2(0.0, 0.04);
    float intensity = texture2D(uWaveMap, waveUV).r;
    
    /* Shadow Logic: Look UP for the casting object (Standard drop shadow falls down) */
    float shadowOffset = 8.0 / uResolution.y; 
    float shadowIntensity = texture2D(uWaveMap, waveUV + vec2(0.0, shadowOffset)).r;
    
    /* Discard only if BOTH are empty */
    if (intensity < 0.01 && shadowIntensity < 0.01) discard;
    
    /* Directional Noise: Streaky vertical noise for rushing water effect */
    /* Stretch heavily along Y-axis to simulate speed/motion blur */
    float streakyNoise = noise(vec2(uv.x * 60.0, uv.y * 4.0 + uTime * 4.0));
    
    /* Define Zones based on Intensity */
    /* Body (Medium Intensity): Darker/turbulent blue with noise */
    /* Edge (High Intensity): Bright white foam */
    
    float foamThreshold = 0.5;
    float foamMix = smoothstep(foamThreshold, foamThreshold + 0.2, intensity);
    
    /* Base Colors */
    vec3 bodyColor = uColorWaveDeep;
    vec3 foamColor = uColorWave;
    
    /* Mix Colors */
    vec3 finalColor = mix(bodyColor, foamColor, foamMix);
    
    /* Add streaks to the body part */
    if (foamMix < 0.9) {
        finalColor += (streakyNoise - 0.5) * 0.15 * (1.0 - foamMix);
    }
    
    /* Hard Edge & Opacity */
    /* Ensure the front (bottom) remains sharp, back trails off */
    
    /* Calculate Alpha based on Intensity */
    /* High Intensity (Front/Bottom): Alpha 1.0 (Fully Opaque) */
    /* Medium Intensity (Body): Alpha 1.0 (Fully Opaque) */
    /* Low Intensity (Top/Tail): Fades to 0.0 */
    
    float finalAlpha = smoothstep(0.02, 0.15, intensity);
    
    /* Screen Fade */
    /* OLD: float screenFade = smoothstep(0.0, 0.1, uv.y) * (1.0 - smoothstep(0.9, 1.0, uv.y)); */
    
    /* Dynamic Shoreline Fade */
    /* Replicate the wave calculation from BACKGROUND_FRAGMENT_SHADER */
    /* Note: speed must match BACKGROUND_FRAGMENT_SHADER (1.2) */
    float speed = 1.2;
    float time = uTime * speed;
    float wave1 = sin(uv.x * 8.0 - time) * 0.04;
    float wave2 = sin(uv.x * 15.0 - time * 0.6) * 0.02;
    float wave = wave1 + wave2;
    float threshold = 0.2 + wave;
    
    /* Fade out quickly after exiting the water body (below threshold) */
    /* We want full opacity at 'threshold' and 0.0 opacity at 'threshold - 0.2' */
    /* Increased fade distance to 0.2 to account for 5x speed (avoids popping in 2 frames) */
    float shoreFade = smoothstep(threshold - 0.2, threshold, uv.y);
    
    float screenFade = shoreFade;
    
    /* --- Composite Shadow & Wave --- */
    float waveAlpha = finalAlpha * screenFade;
    
    /* Shadow Alpha */
    float shadowBaseAlpha = smoothstep(0.02, 0.15, shadowIntensity);
    /* Shadow is weaker (40% opacity) */
    float shadowAlpha = shadowBaseAlpha * 0.4 * screenFade;
    
    /* Mix: Wave over Shadow */
    /* OutAlpha = WaveAlpha + ShadowAlpha * (1 - WaveAlpha) */
    float outAlpha = waveAlpha + shadowAlpha * (1.0 - waveAlpha);
    
    /* OutRGB = WaveRGB * WaveAlpha + ShadowRGB * ShadowAlpha * (1 - WaveAlpha) */
    /* Shadow is black (RGB=0), so second term is 0 */
    vec3 outRGB = finalColor * waveAlpha; 
    
    gl_FragColor = vec4(outRGB, outAlpha);
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
/* Shape: Blue Pill with White Leading Edge */
export const WAVE_BRUSH_FRAGMENT_SHADER = `precision mediump float;
varying vec2 vUv;
varying float vAlpha;

float sdRoundedBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
    vec2 p = vUv - 0.5;
    
    /* Shape: Rounded Box (Pill) */
    vec2 b = vec2(0.35, 0.15);
    float r = 0.05;
    float d = sdRoundedBox(p, b, r);
    
    float shape = 1.0 - smoothstep(0.0, 0.02, d);
    shape = clamp(shape, 0.0, 1.0);

    /* Intensity Gradient: White Foam at Bottom (Leading Edge), Blue Body at Top */
    /* vUv.y: 0=Bottom, 1=Top */
    /* We want foam only at the very bottom, rapidly fading to blue body */
    /* Note: Inverted smoothstep (edge0 > edge1) is used here to flip the gradient direction */
    /* Reducing 0.45 to 0.42 shrinks the foam cap height */
    float foam = smoothstep(0.45, 0.24, vUv.y);
    
    /* Body Gradient: Fade out towards the tail */
    /* Starts fading around 0.4 (just after foam ends) and hits 0.0 at the top */
    float bodyFade = smoothstep(0.4, 0.7, vUv.y);
    float bodyBase = mix(0.45, 0.0, bodyFade);

    /* Map gradient: Bottom=1.0 (Foam), Body=bodyBase */
    float intensity = mix(bodyBase, 1.0, foam);

    gl_FragColor = vec4(shape * intensity * vAlpha, 0.0, 0.0, 1.0);
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
    /* Speed: 16.0 pixels per frame (at sim res) */
    vec2 flow = vec2(0.0, 16.0 / uResolution.y); 
    
    vec2 sourceUv = uv + flow;

    if (sourceUv.y > 1.0) {
        gl_FragColor = vec4(0.0);
        return;
    }
    
    vec4 center = texture2D(uLastFrame, sourceUv);
    
    /* Decay */
    gl_FragColor = center * 0.99;
}`;
