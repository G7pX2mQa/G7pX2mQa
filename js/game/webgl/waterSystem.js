export class WaterSystem {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.width = 0;
        this.height = 0;
    }

    init(backCanvasId, frontCanvasId) {
        // We primarily use the back canvas for the 2D water
        this.canvas = document.getElementById(backCanvasId);
        if (!this.canvas) return;
        
        this.ctx = this.canvas.getContext('2d', { alpha: true });
        
        // Hide or clear the front canvas if it exists (legacy artifact)
        const front = document.getElementById(frontCanvasId);
        if (front) {
            front.style.display = 'none';
        }

        this.resize();
        
        if (!this._boundResize) {
            this._boundResize = () => this.resize();
            window.addEventListener('resize', this._boundResize);
        }
    }

    resize() {
        if (!this.canvas) return;
        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        
        this.width = rect.width;
        this.height = rect.height;
        
        // Handle high-DPI displays
        this.canvas.width = this.width * dpr;
        this.canvas.height = this.height * dpr;
        
        if (this.ctx) {
            this.ctx.resetTransform();
            this.ctx.scale(dpr, dpr);
        }
    }

    addWave(x, y, size) {
        // No-op for simplified 2D system
    }

    update(dt) {
        // No-op
    }

    render(totalTime) {
        if (!this.ctx || this.width === 0 || this.height === 0) return;
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;

        ctx.clearRect(0, 0, w, h);

        // Create Gradient (Top-Down: Deep Blue -> Surface Blue)
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#0a2e4d'); // Deep/Dark Blue at Top
        grad.addColorStop(1, '#2980b9'); // Lighter/Surface Blue at Bottom

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(0, 0); // Top Left
        ctx.lineTo(w, 0); // Top Right

        // Draw Sine Wave along the bottom edge
        // Parameters:
        // Amplitude: How "tall" the waves are (relative to height)
        const amplitude = Math.min(20, h * 0.2); 
        // Frequency: How many waves fit in the width
        const frequency = 0.015; 
        // Phase: Animation over time (speed)
        const phase = totalTime * 3;

        // Draw points along the bottom
        for (let x = 0; x <= w; x += 10) {
            const y = h - amplitude + Math.sin(x * frequency + phase) * amplitude;
            ctx.lineTo(x, y);
        }
        
        ctx.lineTo(w, 0); // Close path back to Top Right (technically redundant but safe)
        ctx.closePath();
        ctx.fill();

        // Optional: Draw a "foam" line at the bottom edge for definition
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 10) {
            const y = h - amplitude + Math.sin(x * frequency + phase) * amplitude;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
    }
}

export const waterSystem = new WaterSystem();
