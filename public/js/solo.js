// Haptic Feedback Utility
class HapticFeedback {
    static isSupported() {
        return 'vibrate' in navigator;
    }

    static light() {
        if (this.isSupported()) navigator.vibrate(10);
    }

    static medium() {
        if (this.isSupported()) navigator.vibrate(20);
    }

    static heavy() {
        if (this.isSupported()) navigator.vibrate(30);
    }

    static success() {
        if (this.isSupported()) navigator.vibrate([10, 50, 10]);
    }

    static error() {
        if (this.isSupported()) navigator.vibrate([20, 100, 20]);
    }

    static victory() {
        if (this.isSupported()) navigator.vibrate([30, 100, 30, 100, 50]);
    }
}

class MemorySolo {
    constructor() {
        this.cards = [];
        this.flippedCards = [];
        this.matchedPairs = 0;
        this.totalPairs = 8;
        this.selectedCardCount = parseInt(localStorage.getItem('memoryGameDifficulty')) || 16;
        this.isLocked = false;
        this.timerInterval = null;
        this.startTime = null;
        this.moves = 0;
        this.combo = 0; // Track consecutive matches

        this.init();
    }


    init() {
        this.setupUI();
        this.setupDifficultySelection();
        this.setupKeyboardNavigation();
    }

    // Screen reader announcements
    announce(message) {
        const announcer = document.getElementById('sr-announcements');
        if (announcer) {
            announcer.textContent = message;
            // Clear after announcement
            setTimeout(() => {
                announcer.textContent = '';
            }, 1000);
        }
    }

    setupKeyboardNavigation() {
        // Allow keyboard navigation on game board
        document.addEventListener('keydown', (e) => {
            // Only handle when game is running and not locked
            if (this.isLocked || !this.cards.length) return;

            const cards = Array.from(document.querySelectorAll('.card:not(.matched)'));
            const focusedCard = document.activeElement;
            const currentIndex = cards.indexOf(focusedCard);

            let newIndex = -1;

            switch (e.key) {
                case 'ArrowRight':
                    e.preventDefault();
                    newIndex = Math.min(currentIndex + 1, cards.length - 1);
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    newIndex = Math.max(currentIndex - 1, 0);
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    // Move to next row (assuming 4 columns for simplicity)
                    newIndex = Math.min(currentIndex + 4, cards.length - 1);
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    newIndex = Math.max(currentIndex - 4, 0);
                    break;
                case 'Enter':
                case ' ':
                    e.preventDefault();
                    if (focusedCard && focusedCard.classList.contains('card')) {
                        const index = parseInt(focusedCard.dataset.index);
                        this.flipCard(index);
                    }
                    break;
            }

            if (newIndex >= 0 && cards[newIndex]) {
                cards[newIndex].focus();
            }
        });
    }

    setupUI() {
        document.getElementById('quitter-btn').addEventListener('click', () => {
            this.showConfirmModal('Voulez-vous vraiment quitter ?', () => {
                window.location.href = '/';
            });
        });

        document.getElementById('rejouer-btn').addEventListener('click', () => {
            this.startNewGame();
            const modal = document.getElementById('finPartieModal');
            if (modal) modal.classList.remove('show');
        });
    }

    setupDifficultySelection() {
        const difficultyModal = document.getElementById('difficultyModal');
        const difficultyBtns = document.querySelectorAll('.difficulty-btn');

        difficultyBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const cardCount = parseInt(btn.dataset.cards);
                this.selectedCardCount = cardCount;
                this.totalPairs = cardCount / 2;

                // Save preference to localStorage
                localStorage.setItem('memoryGameDifficulty', cardCount);

                // Close difficulty modal
                if (difficultyModal) difficultyModal.classList.remove('show');

                // Start the game
                this.startNewGame();
            });
        });
    }

    startNewGame() {
        this.cards = this.generateCards();
        this.flippedCards = [];
        this.matchedPairs = 0;
        this.moves = 0;
        this.combo = 0;
        this.isLocked = false;
        this.updateScore();

        // Initialize progress bar
        this.updateProgress();

        this.generateGameBoard();
        this.startTimer();

        // Hide modal if open
        const modal = document.getElementById('finPartieModal');
        if (modal) modal.classList.remove('show');
    }

    generateCards() {
        // Expanded symbol pool to support up to 32 cards (16 pairs)
        const symbols = [
            '🍎', '🍌', '🍒', '🍇', '🍊', '🍓', '🍑', '🍍',
            '🥭', '🍉', '🍐', '🥝', '🍋', '🥑', '🍆', '🌽'
        ];
        const pairsNeeded = this.selectedCardCount / 2;
        const selected = symbols.slice(0, pairsNeeded);
        const deck = [...selected, ...selected];
        return deck.sort(() => Math.random() - 0.5);
    }

    generateGameBoard() {
        const board = document.getElementById('game-board');
        board.innerHTML = '';

        // Remove all previous grid classes
        board.className = 'game-board';
        // Add appropriate grid class based on card count
        board.classList.add(`cards-${this.selectedCardCount}`);

        this.cards.forEach((symbol, index) => {
            const card = document.createElement('div');
            card.className = 'card';
            card.dataset.index = index;

            // Accessibility attributes
            card.setAttribute('role', 'button');
            card.setAttribute('tabindex', '0');
            card.setAttribute('aria-label', `Carte ${index + 1} sur ${this.cards.length}, face cachée`);
            card.setAttribute('aria-pressed', 'false');

            card.innerHTML = `
                <div class="card-face card-front">
                    <i class="fas fa-question" style="font-size: 1.5rem; opacity: 0.5;"></i>
                </div>
                <div class="card-face card-back">${symbol}</div>
            `;
            card.addEventListener('click', () => this.flipCard(index));
            board.appendChild(card);
        });
    }

    flipCard(index) {
        if (this.isLocked) return;
        if (this.flippedCards.includes(index)) return;

        const card = document.querySelector(`.card[data-index="${index}"]`);
        if (!card) return;

        if (card.classList.contains('matched')) return;
        if (card.classList.contains('flipped')) return;

        // Haptic feedback on tap
        HapticFeedback.light();

        card.classList.add('flipped');
        card.style.setProperty('--card-index', index);

        // Update ARIA
        const symbol = this.cards[index];
        card.setAttribute('aria-label', `Carte ${index + 1}, montre ${symbol}`);
        card.setAttribute('aria-pressed', 'true');

        // Announce for screen readers
        this.announce(`Carte retournée, ${symbol}`);

        // Play flip sound (safe call)
        if (window.soundManager && typeof window.soundManager.playFlip === 'function') {
            window.soundManager.playFlip();
        }

        this.flippedCards.push(index);

        if (this.flippedCards.length === 2) {
            this.moves++;
            this.updateScore();
            // Wait for flip to finish before checking
            setTimeout(() => this.checkMatch(), 600);
        }
    }

    checkMatch() {
        this.isLocked = true;

        const [idx1, idx2] = this.flippedCards;
        const card1 = this.cards[idx1];
        const card2 = this.cards[idx2];

        if (card1 === card2) {
            this.handleMatch(idx1, idx2);
        } else {
            this.handleMismatch(idx1, idx2);
        }
    }

    handleMatch(idx1, idx2) {
        const c1 = document.querySelector(`.card[data-index="${idx1}"]`);
        const c2 = document.querySelector(`.card[data-index="${idx2}"]`);

        setTimeout(() => {
            // Haptic feedback for success
            HapticFeedback.success();

            c1.classList.add('matched');
            c2.classList.add('matched');

            // Update ARIA for matched cards
            c1.setAttribute('aria-label', `Carte ${idx1 + 1}, paire trouvée`);
            c2.setAttribute('aria-label', `Carte ${idx2 + 1}, paire trouvée`);
            c1.setAttribute('aria-disabled', 'true');
            c2.setAttribute('aria-disabled', 'true');

            // Play match sound (safe call)
            if (window.soundManager && typeof window.soundManager.playMatch === 'function') {
                window.soundManager.playMatch();
            }

            this.flippedCards = [];
            this.isLocked = false;
            this.matchedPairs++;

            // Announce match
            this.announce(`Paire trouvée ! ${this.matchedPairs} sur ${this.totalPairs}`);

            // Increment combo
            this.combo++;

            // Show combo toast for streaks
            if (window.toast) {
                if (this.combo === 3) {
                    window.toast.combo('🔥 En feu ! 3 combos !');
                } else if (this.combo === 5) {
                    window.toast.combo('🚀 Incroyable ! 5 combos !');
                } else if (this.combo === 7) {
                    window.toast.combo('⭐ Légendaire ! 7 combos !');
                } else if (this.combo >= 2) {
                    window.toast.success(`Combo x${this.combo} !`, 1500);
                }
            }

            // Update progress bar
            this.updateProgress();

            if (this.matchedPairs === this.totalPairs) {
                this.endGame();
            }
        }, 500);
    }

    handleMismatch(idx1, idx2) {
        const c1 = document.querySelector(`.card[data-index="${idx1}"]`);
        const c2 = document.querySelector(`.card[data-index="${idx2}"]`);

        // Reset combo
        this.combo = 0;

        // Haptic feedback for error
        HapticFeedback.error();

        // Announce mismatch
        this.announce('Pas de correspondance, cartes retournées');

        // Add mismatch animation class
        if (c1) c1.classList.add('mismatch');
        if (c2) c2.classList.add('mismatch');

        // Play sound (safe call)
        try {
            if (window.soundManager && typeof window.soundManager.playMismatch === 'function') {
                window.soundManager.playMismatch();
            }
        } catch (e) {
            console.warn('Could not play mismatch sound:', e);
        }

        // Wait for shake animation to complete, then flip back
        setTimeout(() => {
            if (c1) {
                c1.classList.remove('flipped', 'mismatch');
            }
            if (c2) {
                c2.classList.remove('flipped', 'mismatch');
            }
            this.flippedCards = [];
            this.isLocked = false;
        }, 1000);
    }

    startTimer() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        this.startTime = Date.now();

        const timerEl = document.getElementById('timer-text'); // Assuming we add this ID

        this.timerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
            const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
            const secs = (elapsed % 60).toString().padStart(2, '0');
            if (timerEl) timerEl.textContent = `${mins}:${secs}`;
        }, 1000);
    }

    updateScore() {
        const scoreEl = document.getElementById('moves-count');
        if (scoreEl) {
            // Animate number change
            this.animateNumber(scoreEl, parseInt(scoreEl.textContent) || 0, this.moves, 300);
        }
    }

    updateProgress() {
        const progressFill = document.getElementById('progress-fill');
        const progressText = document.getElementById('progress-text');

        const percentage = Math.round((this.matchedPairs / this.totalPairs) * 100);

        if (progressFill) {
            progressFill.style.width = `${percentage}%`;
        }

        if (progressText) {
            progressText.textContent = `${this.matchedPairs}/${this.totalPairs} paires trouvées`;

            // Add celebration animation when progress updates
            progressText.style.transform = 'scale(1.1)';
            setTimeout(() => {
                progressText.style.transform = 'scale(1)';
            }, 200);
        }
    }

    animateNumber(element, from, to, duration = 400) {
        const start = Date.now();
        const range = to - from;

        const timer = setInterval(() => {
            const elapsed = Date.now() - start;
            const progress = Math.min(elapsed / duration, 1);

            // Easing function for smooth animation
            const easeOut = 1 - Math.pow(1 - progress, 3);
            const current = Math.round(from + range * easeOut);

            element.textContent = current;

            if (progress >= 1) {
                clearInterval(timer);
                element.textContent = to;
            }
        }, 16); // ~60fps
    }

    endGame() {
        clearInterval(this.timerInterval);
        const modal = document.getElementById('finPartieModal');
        const msg = document.getElementById('message-resultat');

        // Haptic feedback for victory
        HapticFeedback.victory();

        // Launch confetti celebration! 🎉
        if (window.confetti) {
            setTimeout(() => {
                window.confetti.launch({
                    particleCount: 200,
                    colors: ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6'],
                    duration: 4000
                });
            }, 500); // Small delay for effect
        }

        if (msg) msg.textContent = `Bravo ! Terminé en ${this.moves} coups.`;
        if (modal) {
            modal.classList.add('show');
        }
        // Play win sound (safe call)
        if (window.soundManager && typeof window.soundManager.playWin === 'function') {
            window.soundManager.playWin();
        }
    }

    showConfirmModal(message, onConfirm) {
        // Remove existing if any
        const existing = document.querySelector('.custom-modal-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.className = 'custom-modal-overlay active';
        overlay.innerHTML = `
            <div class="custom-modal">
                <h3>${message}</h3>
                <div class="custom-modal-actions">
                    <button class="btn btn-secondary" id="modal-cancel">Annuler</button>
                    <button class="btn btn-primary" id="modal-confirm" style="background: var(--danger-color)">Quitter</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        document.getElementById('modal-cancel').addEventListener('click', () => {
            overlay.classList.remove('active');
            setTimeout(() => overlay.remove(), 300);
        });

        document.getElementById('modal-confirm').addEventListener('click', () => {
            onConfirm();
            overlay.classList.remove('active');
            setTimeout(() => overlay.remove(), 300);
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new MemorySolo();
});
