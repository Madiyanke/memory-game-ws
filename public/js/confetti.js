// Confetti Animation Utility
class Confetti {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.particles = [];
        this.animationFrame = null;
    }

    create() {
        // Create canvas
        this.canvas = document.createElement('canvas');
        this.canvas.style.position = 'fixed';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.pointerEvents = 'none';
        this.canvas.style.zIndex = '9999';

        document.body.appendChild(this.canvas);

        this.ctx = this.canvas.getContext('2d');
        this.resizeCanvas();

        window.addEventListener('resize', () => this.resizeCanvas());
    }

    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    launch(options = {}) {
        const {
            particleCount = 150,
            colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'],
            duration = 3000
        } = options;

        if (!this.canvas) this.create();

        // Create particles
        for (let i = 0; i < particleCount; i++) {
            this.particles.push(new ConfettiParticle(
                this.canvas.width / 2,
                this.canvas.height / 2,
                colors[Math.floor(Math.random() * colors.length)]
            ));
        }

        // Animate
        this.animate();

        // Auto cleanup
        setTimeout(() => this.stop(), duration);
    }

    animate() {
        if (!this.ctx) return;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        this.particles = this.particles.filter(p => {
            p.update();
            p.draw(this.ctx);
            return p.lifetime > 0;
        });

        if (this.particles.length > 0) {
            this.animationFrame = requestAnimationFrame(() => this.animate());
        } else {
            this.stop();
        }
    }

    stop() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }

        if (this.canvas) {
            this.canvas.remove();
            this.canvas = null;
            this.ctx = null;
        }

        this.particles = [];
    }
}

class ConfettiParticle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;

        // Random velocity
        const angle = Math.random() * Math.PI * 2;
        const velocity = 5 + Math.random() * 15;
        this.vx = Math.cos(angle) * velocity;
        this.vy = Math.sin(angle) * velocity - 10; // Bias upward

        // Physics
        this.gravity = 0.5;
        this.friction = 0.99;
        this.rotation = Math.random() * 360;
        this.rotationSpeed = (Math.random() - 0.5) * 20;

        // Appearance
        this.size = 5 + Math.random() * 5;
        this.lifetime = 100 + Math.random() * 100;
        this.initialLifetime = this.lifetime;
    }

    update() {
        // Apply physics
        this.vy += this.gravity;
        this.vx *= this.friction;
        this.vy *= this.friction;

        this.x += this.vx;
        this.y += this.vy;
        this.rotation += this.rotationSpeed;

        this.lifetime--;
    }

    draw(ctx) {
        ctx.save();

        // Fade out
        const opacity = this.lifetime / this.initialLifetime;
        ctx.globalAlpha = opacity;

        // Draw rotated rectangle
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation * Math.PI / 180);
        ctx.fillStyle = this.color;
        ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size * 2);

        ctx.restore();
    }
}

// Create global instance
window.confetti = new Confetti();
