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

        this.init();
    }


    init() {
        this.setupUI();
        this.setupDifficultySelection();
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
        this.isLocked = false;
        this.updateScore();
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
        if (card.classList.contains('matched')) return;

        card.classList.add('flipped');
        if (window.soundManager) window.soundManager.playFlip();

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
            c1.classList.add('matched');
            c2.classList.add('matched');
            if (window.soundManager) window.soundManager.playMatch();

            this.flippedCards = [];
            this.isLocked = false;
            this.matchedPairs++;

            if (this.matchedPairs === this.totalPairs) {
                this.endGame();
            }
        }, 500);
    }

    handleMismatch(idx1, idx2) {
        const c1 = document.querySelector(`.card[data-index="${idx1}"]`);
        const c2 = document.querySelector(`.card[data-index="${idx2}"]`);

        // Add shake animation
        if (c1) c1.classList.add('shake');
        if (c2) c2.classList.add('shake');

        setTimeout(() => {
            if (c1) {
                c1.classList.remove('flipped', 'shake');
            }
            if (c2) {
                c2.classList.remove('flipped', 'shake');
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
        if (scoreEl) scoreEl.textContent = this.moves;
    }

    endGame() {
        console.log('🎉 Game completed! Showing victory modal...');
        console.log(`Matched pairs: ${this.matchedPairs}/${this.totalPairs}`);

        clearInterval(this.timerInterval);
        const modal = document.getElementById('finPartieModal');
        const msg = document.getElementById('message-resultat');

        console.log('Modal element:', modal);

        if (msg) msg.textContent = `Bravo ! Terminé en ${this.moves} coups.`;
        if (modal) {
            modal.classList.add('show');
            console.log('✅ Modal "show" class added');
        } else {
            console.error('❌ Modal element not found!');
        }
        if (window.soundManager) window.soundManager.playWin();
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
