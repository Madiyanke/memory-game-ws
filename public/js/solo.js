class MemorySolo {
    constructor() {
        this.cards = [];
        this.flippedCards = [];
        this.matchedPairs = 0;
        this.totalPairs = 8;
        this.isLocked = false;
        this.timerInterval = null;
        this.startTime = null;
        this.moves = 0;

        this.init();
    }

    init() {
        this.setupUI();
        this.startNewGame();
    }

    setupUI() {
        document.getElementById('quitter-btn').addEventListener('click', () => {
            if (confirm('Quitter la partie ?')) window.location.href = '/';
        });

        document.getElementById('rejouer-btn').addEventListener('click', () => {
            this.startNewGame();
            const modal = document.getElementById('finPartieModal');
            if (modal) modal.classList.remove('show');
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
        const symbols = ['🍎', '🍌', '🍒', '🍇', '🍊', '🍓', '🍑', '🍍', '🥭', '🍉', '🍐', '🥝'];
        const selected = symbols.slice(0, 8);
        const deck = [...selected, ...selected];
        return deck.sort(() => Math.random() - 0.5);
    }

    generateGameBoard() {
        const board = document.getElementById('game-board');
        board.innerHTML = '';

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
            this.checkMatch();
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

        setTimeout(() => {
            c1.classList.remove('flipped');
            c2.classList.remove('flipped');
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
        clearInterval(this.timerInterval);
        const modal = document.getElementById('finPartieModal');
        const msg = document.getElementById('message-resultat');
        if (msg) msg.textContent = `Bravo ! Terminé en ${this.moves} coups.`;
        if (modal) modal.classList.add('show');
        if (window.soundManager) window.soundManager.playWin();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new MemorySolo();
});
