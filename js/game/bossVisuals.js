import { playAudio } from '../util/audioManager.js';

// Reusing palette from tsunamiVisuals for consistency
const PALETTE = {
    skyTop: '#4fa8ff',
    skyBottom: '#b8e1ff',
    sun: '#ffeb3b',
    sandLight: '#f1dcb1',
    sandDark: '#debe7c',
    rock: '#5d4037',
    leaf: '#4caf50',
    shell: '#fff0f5'
};

function drawPalmTree(ctx, x, y, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    // Trunk
    ctx.fillStyle = '#8b5a2b';
    ctx.beginPath();
    ctx.moveTo(-5, 0);
    ctx.quadraticCurveTo(10, -50, 0, -100);
    ctx.quadraticCurveTo(-10, -50, 5, 0);
    ctx.fill();

    // Leaves
    ctx.fillStyle = PALETTE.leaf;
    for (let i = 0; i < 5; i++) {
        ctx.save();
        ctx.translate(0, -95);
        ctx.rotate((i * Math.PI * 2) / 5 + 0.5);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(40, -20, 60, 0);
        ctx.quadraticCurveTo(40, 20, 0, 0);
        ctx.fill();
        ctx.restore();
    }

    ctx.restore();
}

function drawRock(ctx, x, y, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    
    ctx.fillStyle = PALETTE.rock;
    ctx.beginPath();
    ctx.moveTo(-20, 0);
    ctx.lineTo(-10, -15);
    ctx.lineTo(10, -20);
    ctx.lineTo(25, -5);
    ctx.lineTo(20, 0);
    ctx.fill();

    // Highlight
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.beginPath();
    ctx.moveTo(-10, -15);
    ctx.lineTo(0, -18);
    ctx.lineTo(5, -10);
    ctx.fill();

    ctx.restore();
}

export function playBossFightSequence(container, onComplete, options = {}) {
    // Hide cursor initially
    container.style.cursor = 'none';

    // Start Boss Music
    const bossMusic = playAudio('sounds/Secret_Boss_Fight.ogg', { loop: true, volume: 1.0, type: 'music' });

    // --- Canvas Setup ---
    const canvas = document.createElement('canvas');
    canvas.id = 'bossfight-canvas';
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.zIndex = '2147483644'; 
    container.appendChild(canvas);

    const ctx = canvas.getContext('2d', { alpha: false });
    let width, height;
    let props = [];

    function generateProps() {
        props = [];
        // Palm trees receding into distance
        for (let i = 0; i < 8; i++) {
            props.push({
                type: 'tree',
                x: width * 0.1 + Math.random() * width * 0.8,
                y: height * 0.55 + Math.random() * height * 0.4,
                scale: 0.5 + Math.random() * 1.5
            });
        }
        // Rocks scattered
        for (let i = 0; i < 15; i++) {
            props.push({
                type: 'rock',
                x: Math.random() * width,
                y: height * 0.6 + Math.random() * height * 0.4,
                scale: 0.5 + Math.random() * 2
            });
        }
        
        // Sort by Y so things lower on the screen (closer) are drawn last
        props.sort((a, b) => a.y - b.y);
    }

    function resize() {
        const dpr = window.devicePixelRatio || 1;
        width = window.innerWidth;
        height = window.innerHeight;

        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';

        ctx.scale(dpr, dpr);
        generateProps();
    }
    window.addEventListener('resize', resize);
    resize();
    
    let isRunning = true;
    let animationFrameId;

    function loop() {
        if (!isRunning) return;

        // 1. Draw Sky
        const grad = ctx.createLinearGradient(0, 0, 0, height * 0.6);
        grad.addColorStop(0, PALETTE.skyTop);
        grad.addColorStop(1, PALETTE.skyBottom);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);

        // 2. Draw Sun
        const sunY = height * 0.2; 
        ctx.beginPath();
        ctx.arc(width * 0.5, sunY, 60, 0, Math.PI * 2);
        ctx.fillStyle = PALETTE.sun;
        ctx.shadowColor = PALETTE.sun;
        ctx.shadowBlur = 30;
        ctx.fill();
        ctx.shadowBlur = 0;

        // 3. Draw Sand (Horizon line at ~60% down)
        const sandY = height * 0.55;
        ctx.fillStyle = PALETTE.sandDark;
        ctx.fillRect(0, sandY, width, height - sandY);
        
        // Add some basic dune curves to break up the flat line
        ctx.beginPath();
        ctx.moveTo(0, sandY + 50);
        ctx.quadraticCurveTo(width * 0.25, sandY - 20, width * 0.5, sandY + 20);
        ctx.quadraticCurveTo(width * 0.75, sandY + 60, width, sandY);
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.fillStyle = PALETTE.sandLight;
        ctx.fill();

        // 4. Draw Props
        props.forEach(prop => {
            if (prop.type === 'tree') drawPalmTree(ctx, prop.x, prop.y, prop.scale);
            else if (prop.type === 'rock') drawRock(ctx, prop.x, prop.y, prop.scale);
        });

        animationFrameId = requestAnimationFrame(loop);
    }

    function cleanup() {
        isRunning = false;
        container.style.cursor = '';
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        window.removeEventListener('resize', resize);
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        
        if (bossMusic) bossMusic.stop();
    }

    loop();
    
    return {
        cleanup,
        showCursor: () => { container.style.cursor = ''; },
        hideCursor: () => { container.style.cursor = 'none'; }
    };
}