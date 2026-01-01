export const VERTEX_SHADER = `
attribute vec2 position;
varying vec2 vUv;
void main() {
    vUv = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
}
`;

export const FRAGMENT_SHADER = `
precision mediump float;

varying vec2 vUv;
uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uWaveParams[20]; // [x, y, width]
uniform float uWaveTimes[20]; // [elapsedTime]
uniform int uWaveCount;
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
    vec2 st = gl_FragCoord.xy / uResolution.xy;
    // Correct aspect ratio for circular shapes
    vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
    vec2 uv = st * aspect;

    float mask = 0.0;
    float foamMask = 0.0;
    
    // Iterate through active waves
    for (int i = 0; i < 20; i++) {
        if (i >= uWaveCount) break;
        
        vec3 params = uWaveParams[i]; // x (0-1), y (0-1), width (0-1)
        float t = uWaveTimes[i];      // elapsed time in seconds

        // Convert normalized coords to aspect-corrected uv space
        vec2 center = vec2(params.x, 1.0 - params.y) * aspect; 
        
        // Wave logic: An arc or blob moving down
        // It starts at 'center' and moves down over time
        // But the spawner updates the Y position, so params.y is current Y.
        
        // Visual Shape: A metaball-like blob
        // Width is params.z
        float radius = params.z * 0.5;
        
        vec2 distVec = uv - center;
        float dist = length(distVec);
        
        // Distortion
        float noiseVal = fbm(uv * 10.0 + uTime * 0.5) * 0.1;
        
        // Soft edge (metaball influence)
        // We use a smoothstep to create a solid core and soft edge
        float influence = smoothstep(radius + 0.05, radius - 0.05, dist + noiseVal);
        
        // Fade out based on life/time if handled in JS, or just use alpha
        // We assume params are updated every frame, so we just draw opacity 1 here
        // But we can add foam at the edges
        
        mask += influence;
        
        // Foam is the edge of the influence
        float foam = smoothstep(radius + 0.02, radius - 0.01, dist + noiseVal) - smoothstep(radius - 0.04, radius - 0.08, dist + noiseVal);
        foamMask += max(0.0, foam);
    }
    
    if (mask <= 0.01) {
        discard;
    }
    
    mask = clamp(mask, 0.0, 1.0);
    foamMask = clamp(foamMask, 0.0, 1.0);
    
    vec3 color = mix(uColorDeep, uColorShallow, mask);
    color = mix(color, uColorFoam, foamMask);
    
    // Final alpha - if it's a "wave", it should be somewhat opaque to cover the coin
    // But maybe slightly translucent at the edges
    float alpha = smoothstep(0.0, 0.2, mask) * 0.9; // 0.9 max opacity
    
    gl_FragColor = vec4(color, alpha);
}
`;