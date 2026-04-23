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

export function playSecretDlgBossFightSequence(container, onComplete, options = {}) {
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

    // Camera state
    let cameraX = 0;
    const cameraSpeed = 5;
    let keys = {
        left: false,
        right: false
    };

    function onKeyDown(e) {
        if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') keys.left = true;
        if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') keys.right = true;
    }

    function onKeyUp(e) {
        if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') keys.left = false;
        if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') keys.right = false;
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    const CHUNK_WIDTH = 2000;
    const chunks = new Map(); // chunkIndex -> props[]
    
    // A simple PRNG to ensure props are generated deterministically per chunk
    function seededRandom(seed) {
        let x = Math.sin(seed++) * 10000;
        return x - Math.floor(x);
    }

    function generateChunkProps(chunkIndex) {
        const chunkProps = [];
        let seed = chunkIndex * 1337; // Arbitrary multiplier for seed

        // Palm trees receding into distance
        const treeCount = Math.floor(seededRandom(seed++) * 4) + 4; // 4 to 7 trees
        for (let i = 0; i < treeCount; i++) {
            chunkProps.push({
                type: 'tree',
                x: chunkIndex * CHUNK_WIDTH + seededRandom(seed++) * CHUNK_WIDTH,
                y: height * 0.55 + seededRandom(seed++) * height * 0.4,
                scale: 0.5 + seededRandom(seed++) * 1.5
            });
        }
        
        // Rocks scattered
        const rockCount = Math.floor(seededRandom(seed++) * 8) + 7; // 7 to 14 rocks
        for (let i = 0; i < rockCount; i++) {
            chunkProps.push({
                type: 'rock',
                x: chunkIndex * CHUNK_WIDTH + seededRandom(seed++) * CHUNK_WIDTH,
                y: height * 0.6 + seededRandom(seed++) * height * 0.4,
                scale: 0.5 + seededRandom(seed++) * 2
            });
        }
        
        // Sort by Y so things lower on the screen (closer) are drawn last
        chunkProps.sort((a, b) => a.y - b.y);
        return chunkProps;
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
        // Clear cached chunks on resize so they generate with new height bounds
        chunks.clear();
    }
    window.addEventListener('resize', resize);
    resize();
    
    let isRunning = true;
    let animationFrameId;

    function loop() {
        if (!isRunning) return;

        // Update camera position continuously
        if (keys.left) cameraX -= cameraSpeed;
        if (keys.right) cameraX += cameraSpeed;

        // Determine which chunks are visible
        const startChunk = Math.floor(cameraX / CHUNK_WIDTH) - 1;
        const endChunk = Math.floor((cameraX + width) / CHUNK_WIDTH) + 1;

        // Gather props for visible chunks
        let visibleProps = [];
        for (let i = startChunk; i <= endChunk; i++) {
            if (!chunks.has(i)) {
                chunks.set(i, generateChunkProps(i));
            }
            // To ensure proper depth sorting across chunks, we can't just draw chunk by chunk
            // if we want perfect overlap, but drawing per chunk is usually fine if they don't overlap too much.
            // For perfection, we merge and sort.
            visibleProps.push(...chunks.get(i));
        }
        
        visibleProps.sort((a, b) => a.y - b.y);

        // 1. Draw Sky
        const grad = ctx.createLinearGradient(0, 0, 0, height * 0.6);
        grad.addColorStop(0, PALETTE.skyTop);
        grad.addColorStop(1, PALETTE.skyBottom);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);

        // 2. Draw Sun (Static in background)
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
        // We'll pan the dunes slightly for parallax
        const duneParallax = 0.3;
        
        // Fix modulo for negative offsets
        let rawOffset = -(cameraX * duneParallax) % width;
        if (rawOffset > 0) {
            rawOffset -= width;
        }
        let currentOffset = rawOffset;
        
        ctx.fillStyle = PALETTE.sandLight;
        ctx.beginPath();
        
        // Draw enough curves to cover the screen plus the offset
        ctx.moveTo(currentOffset, height);
        ctx.lineTo(currentOffset, sandY + 50);
        
        // Loop drawing dunes to fill the screen
        while (currentOffset < width) {
            ctx.quadraticCurveTo(currentOffset + width * 0.25, sandY - 20, currentOffset + width * 0.5, sandY + 20);
            ctx.quadraticCurveTo(currentOffset + width * 0.75, sandY + 60, currentOffset + width, sandY);
            currentOffset += width;
        }
        
        ctx.lineTo(width, height);
        ctx.fill();

        // 4. Draw Props
        visibleProps.forEach(prop => {
            let renderX = prop.x - cameraX;
            // Draw if on screen (with some margin based on scale)
            const margin = 150 * prop.scale;
            if (renderX > -margin && renderX < width + margin) {
                if (prop.type === 'tree') drawPalmTree(ctx, renderX, prop.y, prop.scale);
                else if (prop.type === 'rock') drawRock(ctx, renderX, prop.y, prop.scale);
            }
        });

        // Optional: clear old chunks to free memory if camera moved far away
        for (let key of chunks.keys()) {
            if (key < startChunk - 5 || key > endChunk + 5) {
                chunks.delete(key);
            }
        }

        animationFrameId = requestAnimationFrame(loop);
    }

    function cleanup() {
        isRunning = false;
        container.style.cursor = '';
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        window.removeEventListener('resize', resize);
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
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
