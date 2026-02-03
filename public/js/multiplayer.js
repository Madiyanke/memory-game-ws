class MemoryMultiplayer {
    constructor() {
        this.socket = io();
        this.roomCode = null;
        this.playerRole = null;
        this.gameState = 'waiting';
        this.currentPlayer = null;
        this.cardCount = 16; // Default
        this.flippedCards = [];
        this.flippedValues = {};
        this.cardsState = {};
        this.timerInterval = null;

        this.init();
    }

    init() {
        this.setupSocketEvents();
        this.setupUIEvents();
        this.loadRoomFromStorage();
    }

    setupSocketEvents() {
        this.socket.on('connect', () => {
            console.log('Connecté au serveur Socket.IO');
            this.rejoinRoomIfNeeded();
        });

        this.socket.on('etat-salle', (data) => {
            console.log('État salle reçu:', data);
            this.updateGameState(data);
        });

        this.socket.on('carte-retournee', (data) => {
            console.log('Carte retournée:', data);
            if (window.soundManager) window.soundManager.playFlip();
            this.showCard(data.cardIndex, data.value, data.player);
        });

        this.socket.on('paire-trouvee', (data) => {
            if (window.soundManager) window.soundManager.playMatch();
            this.markCardsAsMatched(data.card1Index, data.card2Index, data.player);
            this.updateScores(data.scores);

            // Reset local flipped state so the player can continue playing immediately
            this.flippedCards = [];
            this.flippedValues = {};

            if (data.player === this.playerRole) {
                this.showToast('🎉 Paire trouvée ! Rejouez !', 'success');
            } else {
                this.showToast(`L'adversaire a trouvé une paire !`, 'info');
            }
        });

        this.socket.on('changement-tour', (data) => {
            this.switchTurn(data.nouveauJoueur);
        });

        this.socket.on('changement-tour-timeout', (data) => {
            this.showToast('⏰ Temps écoulé ! Changement de tour', 'warning');
            this.switchTurn(data.nouveauJoueur);
        });

        this.socket.on('cacher-cartes', (data) => {
            setTimeout(() => {
                this.hideCards(data.card1Index, data.card2Index);
                // Reset local flipped state
                this.flippedCards = [];
                this.flippedValues = {};
            }, 600);
        });

        this.socket.on('partie-terminee', (data) => this.showGameResult(data));

        this.socket.on('timer-start', (data) => this.handleTimerStart(data));

        this.socket.on('joueur-deconnecte', (data) => this.showToast(`⚠️ ${data.message}`, 'danger'));

        this.socket.on('erreur', (data) => this.showToast(`❌ ${data.message}`, 'danger'));

        this.socket.on('salle_pleine', (data) => {
            this.showToast(`❌ ${data.message}`, 'danger');
            setTimeout(() => window.location.href = '/', 2000);
        });

        this.socket.on('disconnect', () => this.showToast('🔌 Déconnecté du serveur', 'danger'));
    }

    setupUIEvents() {
        const quitter = document.getElementById('quitter-btn');
        if (quitter) quitter.addEventListener('click', () => {
            this.showConfirmModal('Voulez-vous vraiment quitter la partie ?', () => {
                if (this.roomCode) this.socket.emit('quitter-salle', this.roomCode);
                localStorage.removeItem('roomCode');
                localStorage.removeItem('playerName');
                window.location.href = '/';
            });
        });

        const copier = document.getElementById('copier-code-btn');
        if (copier) copier.addEventListener('click', () => this.copyRoomCode());

        const rejouer = document.getElementById('rejouer-btn');
        if (rejouer) rejouer.addEventListener('click', () => {
            if (!this.roomCode) return;
            this.socket.emit('rejouer', this.roomCode);
            const modalEl = document.getElementById('finPartieModal');
            if (modalEl) modalEl.classList.remove('show');
        });
    }

    loadRoomFromStorage() {
        this.roomCode = localStorage.getItem('roomCode');
        const playerName = localStorage.getItem('playerName');

        if (!this.roomCode || !playerName) {
            if (window.location.pathname.includes('jeu.html')) {
                window.location.href = '/';
            }
            return;
        }

        const codeEl = document.getElementById('salle-code');
        if (codeEl) codeEl.textContent = `CODE: ${this.roomCode}`;

        const codeAttente = document.getElementById('code-attente');
        if (codeAttente) codeAttente.textContent = this.roomCode;

        this.joinRoom(this.roomCode, playerName);
    }

    rejoinRoomIfNeeded() {
        if (this.roomCode) {
            const playerName = localStorage.getItem('playerName');
            this.socket.emit('rejoindre-salle', { roomCode: this.roomCode, playerName });
        }
    }

    joinRoom(roomCode, playerName) {
        this.socket.emit('rejoindre-salle', { roomCode, playerName });
    }

    updateGameState(data) {
        this.roomCode = data.code;
        this.gameState = data.gameState;
        this.currentPlayer = data.currentPlayer;
        this.cardCount = data.cardCount || 16;
        this.cardsState = data.cardsState || {};
        this.flippedCards = data.flippedCards || [];
        this.flippedValues = data.flippedValues || {};

        this.updateUI(data);

        if (this.gameState === 'playing') {
            const modal = document.getElementById('attenteModal');
            if (modal) modal.classList.remove('show');

            if (document.getElementById('game-board').children.length === 0) {
                this.generateGameBoard();
            } else {
                this.updateCardsState();
            }
        } else if (this.gameState === 'waiting') {
            const modal = document.getElementById('attenteModal');
            if (modal) modal.classList.add('show');
        }
    }

    updateUI(data) {
        const p1 = data.players.find(p => p.role === 'player1');
        const p2 = data.players.find(p => p.role === 'player2');

        if (p1) {
            document.getElementById('nom-joueur1').textContent = p1.name;
            document.getElementById('final-nom1').textContent = p1.name;
            if (p1.socketId === this.socket.id) {
                this.playerRole = 'player1';
                document.getElementById('player1-card').classList.add('active');
            }
        }
        if (p2) {
            document.getElementById('nom-joueur2').textContent = p2.name;
            document.getElementById('final-nom2').textContent = p2.name;
            if (p2.socketId === this.socket.id) {
                this.playerRole = 'player2';
            }
        }

        this.updateScores(data.scores);
        this.updateTurnIndicator();
    }

    updateScores(scores) {
        if (!scores) return;
        document.getElementById('score-joueur1').textContent = scores.player1;
        document.getElementById('score-joueur2').textContent = scores.player2;
        document.getElementById('final-score1').textContent = scores.player1;
        document.getElementById('final-score2').textContent = scores.player2;
    }

    updateTurnIndicator() {
        const tourText = document.getElementById('tour-text');
        const p1Card = document.getElementById('player1-card');
        const p2Card = document.getElementById('player2-card');

        if (p1Card) p1Card.classList.remove('active', 'active-turn');
        if (p2Card) p2Card.classList.remove('active', 'active-turn');

        if (this.gameState === 'waiting') {
            tourText.textContent = 'En attente d\'un adversaire...';
            tourText.style.color = 'var(--warning-color)';
        } else if (this.currentPlayer === this.playerRole) {
            tourText.textContent = '🎮 C\'est votre tour !';
            tourText.style.color = 'var(--success-color)';
            if (this.playerRole === 'player1' && p1Card) p1Card.classList.add('active-turn');
            if (this.playerRole === 'player2' && p2Card) p2Card.classList.add('active-turn');
        } else {
            tourText.textContent = '⏳ Tour de l\'adversaire...';
            tourText.style.color = 'var(--text-muted)';
            if (this.currentPlayer === 'player1' && p1Card) p1Card.classList.add('active-turn');
            if (this.currentPlayer === 'player2' && p2Card) p2Card.classList.add('active-turn');
        }
    }

    generateGameBoard() {
        const gameBoard = document.getElementById('game-board');
        if (!gameBoard) return;
        gameBoard.innerHTML = '';

        // Remove all previous grid classes and add appropriate one
        gameBoard.className = 'game-board';
        gameBoard.classList.add(`cards-${this.cardCount}`);

        for (let i = 0; i < this.cardCount; i++) {
            const card = document.createElement('div');
            card.className = 'card';
            card.dataset.index = i;
            card.innerHTML = `
                <div class="card-face card-front">
                    <i class="fas fa-question" style="font-size: 1.5rem; opacity: 0.5;"></i>
                </div>
                <div class="card-face card-back"></div>
            `;
            card.addEventListener('click', () => this.handleCardClick(i));
            gameBoard.appendChild(card);
        }
        this.updateCardsState();
    }

    handleCardClick(index) {
        if (this.gameState !== 'playing') return;
        if (this.currentPlayer !== this.playerRole) {
            this.showToast('Ce n\'est pas votre tour !', 'warning');
            return;
        }
        if (this.flippedCards.includes(index)) return;
        if (this.cardsState[index] && this.cardsState[index].matched) return;
        if (this.flippedCards.length >= 2) return;

        // Optimistic update
        this.flippedCards.push(index);
        const card = document.querySelector(`.card[data-index="${index}"]`);
        if (card) {
            card.classList.add('flipped');
            if (window.soundManager) window.soundManager.playFlip();
        }

        this.socket.emit('retourner-carte', { roomCode: this.roomCode, cardIndex: index });
    }

    updateCardsState() {
        const cards = document.querySelectorAll('.card');
        cards.forEach((card, index) => {
            const cardState = this.cardsState[index];

            card.classList.remove('flipped', 'matched');

            if (cardState && cardState.matched) {
                card.classList.add('flipped', 'matched');
                if (cardState.value) {
                    const back = card.querySelector('.card-back');
                    if (back) back.textContent = cardState.value;
                }
            } else if (this.flippedCards.includes(index)) {
                card.classList.add('flipped');
                if (this.flippedValues && this.flippedValues[index]) {
                    const back = card.querySelector('.card-back');
                    if (back) back.textContent = this.flippedValues[index];
                }
            }
        });
    }

    showCard(index, value, player) {
        const card = document.querySelector(`.card[data-index="${index}"]`);
        if (!card) return;

        const back = card.querySelector('.card-back');
        if (back) back.textContent = value;

        card.classList.add('flipped');

        if (player === 'player1') {
            if (back) back.style.border = '2px solid var(--primary-color)';
        } else {
            if (back) back.style.border = '2px solid var(--secondary-color)';
        }
    }

    markCardsAsMatched(idx1, idx2, player) {
        const c1 = document.querySelector(`.card[data-index="${idx1}"]`);
        const c2 = document.querySelector(`.card[data-index="${idx2}"]`);

        if (c1) c1.classList.add('matched');
        if (c2) c2.classList.add('matched');
    }

    hideCards(idx1, idx2) {
        const c1 = document.querySelector(`.card[data-index="${idx1}"]`);
        const c2 = document.querySelector(`.card[data-index="${idx2}"]`);

        if (c1) c1.classList.add('shake');
        if (c2) c2.classList.add('shake');

        setTimeout(() => {
            if (c1) c1.classList.remove('flipped', 'shake');
            if (c2) c2.classList.remove('flipped', 'shake');
        }, 500);
    }

    switchTurn(nouveauJoueur) {
        this.currentPlayer = nouveauJoueur;
        this.updateTurnIndicator();
    }

    handleTimerStart(data) {
        const duration = data.duration;
        const start = data.startedAt;
        const countdownEl = document.getElementById('countdown');
        const timerFg = document.querySelector('.timer-fg');

        if (!countdownEl || !timerFg) return;

        if (this.timerInterval) clearInterval(this.timerInterval);

        const circumference = 2 * Math.PI * 45; // r=45

        const tick = () => {
            const now = Date.now();
            const elapsed = (now - start) / 1000;
            const remaining = Math.max(0, Math.ceil(duration - elapsed));

            countdownEl.textContent = remaining;

            const offset = circumference - (remaining / duration) * circumference;
            timerFg.style.strokeDashoffset = offset;

            if (remaining <= 3) {
                timerFg.style.stroke = 'var(--danger-color)';
            } else {
                timerFg.style.stroke = 'var(--primary-color)';
            }

            if (remaining <= 0) {
                clearInterval(this.timerInterval);
            }
        };

        this.timerInterval = setInterval(tick, 100);
        tick();
    }

    showGameResult(data) {
        const modal = document.getElementById('finPartieModal');
        const msgEl = document.getElementById('message-resultat');

        let msg = '';
        if (data.gagnant === 'égalité') {
            msg = '🤝 Match Nul !';
        } else if (data.gagnant === this.playerRole) {
            msg = '🏆 Vous avez GAGNÉ !';
            if (window.soundManager) window.soundManager.playWin();
        } else {
            msg = '😢 Vous avez perdu...';
        }

        if (msgEl) msgEl.textContent = msg;
        if (modal) modal.classList.add('show');
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = 'toast';

        let icon = 'info-circle';
        if (type === 'success') icon = 'check-circle';
        if (type === 'warning') icon = 'exclamation-triangle';
        if (type === 'danger') icon = 'times-circle';

        let color = 'white';
        if (type === 'success') color = 'var(--success-color)';
        if (type === 'warning') color = 'var(--warning-color)';
        if (type === 'danger') color = 'var(--danger-color)';

        toast.innerHTML = `
            <i class="fas fa-${icon}" style="color: ${color}; font-size: 1.2rem;"></i>
            <span>${message}</span>
        `;

        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    copyRoomCode() {
        if (!this.roomCode) return;
        navigator.clipboard.writeText(this.roomCode);
        this.showToast('Code copié !', 'success');
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
    new MemoryMultiplayer();
});