/* Consolidated client script for the multiplayer Memory game. */
class MemoryMultiplayer {
    constructor() {
        this.socket = io();
        this.roomCode = null;
        this.playerRole = null;
        this.gameState = 'waiting';
        this.currentPlayer = null;
        this.flippedCards = [];
        this.cardsState = {};

        this.init();
    }

    init() {
        this.setupSocketEvents();
        this.setupUIEvents();
        this.loadRoomFromURL();
    }

    setupSocketEvents() {
        this.socket.on('connect', () => {
            console.log('✅ Connecté au serveur');
            this.rejoinRoomIfNeeded();
        });

        this.socket.on('etat-salle', (data) => this.updateGameState(data));
        this.socket.on('carte-retournee', (data) => this.showCard(data.cardIndex, data.value, data.player));
        this.socket.on('paire-trouvee', (data) => { this.markCardsAsMatched(data.card1Index, data.card2Index, data.player); this.updateScores(data.scores); });
        this.socket.on('changement-tour', (data) => this.switchTurn(data.nouveauJoueur));
        this.socket.on('changement-tour-timeout', (data) => { this.showMessage('⏰ Temps écoulé ! Changement de tour'); this.switchTurn(data.nouveauJoueur); });
        this.socket.on('cacher-cartes', (data) => this.hideCards(data.card1Index, data.card2Index));
        this.socket.on('partie-terminee', (data) => this.showGameResult(data));
    this.socket.on('timer-start', (data) => this.handleTimerStart(data));
        this.socket.on('joueur-deconnecte', (data) => this.showMessage(`⚠️ ${data.message}`));
        this.socket.on('erreur', (data) => this.showMessage(`❌ ${data.message}`));
        this.socket.on('salle_pleine', (data) => { this.showMessage(`❌ ${data.message}`); setTimeout(() => window.location.href = '/', 2000); });
        this.socket.on('salle_existe_deja', (data) => this.showMessage(`❌ ${data.message}`));
        this.socket.on('disconnect', () => this.showMessage('🔌 Déconnecté du serveur'));
    }

    setupUIEvents() {
        const quitter = document.getElementById('quitter-btn');
        if (quitter) quitter.addEventListener('click', () => {
            if (confirm('Voulez-vous vraiment quitter la partie ?')) {
                if (this.roomCode) this.socket.emit('quitter-salle', this.roomCode);
                try { localStorage.removeItem('roomCode'); localStorage.removeItem('playerName'); } catch (e) {}
                window.location.href = '/';
            }
        });

        const copier = document.getElementById('copier-code-btn');
        if (copier) copier.addEventListener('click', () => this.copyRoomCode());

        // Rejouer: relancer une partie dans la même salle en gardant les joueurs
        const rejouer = document.getElementById('rejouer-btn');
        if (rejouer) rejouer.addEventListener('click', () => {
            if (!this.roomCode) return;
            this.socket.emit('rejouer', this.roomCode);
            // Hide the end-game modal if open
            const modalEl = document.getElementById('finPartieModal');
            const modal = modalEl ? bootstrap.Modal.getInstance(modalEl) : null;
            if (modal) modal.hide();
        });
    }

    loadRoomFromURL() {
        const urlParams = new URLSearchParams(window.location.search);
        // Support 'room' (used by create page) and 'salle' (older code)
        // Prefer values stored in localStorage (set by create/join pages). Fallback to URL for backward compatibility.
        this.roomCode = localStorage.getItem('roomCode') || urlParams.get('room') || urlParams.get('salle');
        const playerName = localStorage.getItem('playerName') || urlParams.get('nom') || `Joueur${Math.floor(Math.random() * 1000)}`;

        if (!this.roomCode) {
            this.showMessage('❌ Aucune salle spécifiée');
            setTimeout(() => window.location.href = '/', 2000);
            return;
        }

        // store room and playerName in localStorage (so subsequent reloads keep them) and remove query params from the URL
        localStorage.setItem('roomCode', this.roomCode);
        if (!localStorage.getItem('playerName')) localStorage.setItem('playerName', playerName);

        // Remove query params from the address bar so users can't tamper with them
        try {
            const newUrl = window.location.origin + window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
        } catch (e) {
            // ignore in older browsers
        }

        this.joinRoom(this.roomCode, playerName);
    }

    rejoinRoomIfNeeded() {
        if (this.roomCode) {
            this.socket.emit('demander-etat-salle', this.roomCode);
        }
    }

    joinRoom(roomCode, playerName) {
        this.socket.emit('rejoindre-salle', { roomCode, playerName });
        const codeEl = document.getElementById('code-attente'); if (codeEl) codeEl.textContent = roomCode;
        const modalEl = document.getElementById('attenteModal'); if (modalEl) new bootstrap.Modal(modalEl).show();
    }

    updateGameState(data) {
        this.roomCode = data.code;
        this.gameState = data.gameState;
        this.currentPlayer = data.currentPlayer;
        this.cardsState = data.cardsState || {};
        this.flippedCards = data.flippedCards || [];

        this.updateUI(data);

        if (this.gameState === 'playing') {
            const modal = bootstrap.Modal.getInstance(document.getElementById('attenteModal'));
            if (modal) modal.hide();

            if (document.querySelectorAll('.carte').length === 0) this.generateGameBoard();
            else this.updateCardsState();
        }
    }

    updateUI(data) {
        const codeEl = document.getElementById('salle-code'); if (codeEl) codeEl.textContent = data.code;

        // reset
        const nom1 = document.getElementById('nom-joueur1'); if (nom1) nom1.textContent = 'En attente...';
        const nom2 = document.getElementById('nom-joueur2'); if (nom2) nom2.textContent = 'En attente...';
        const score1 = document.getElementById('score-joueur1'); if (score1) score1.textContent = '0';
        const score2 = document.getElementById('score-joueur2'); if (score2) score2.textContent = '0';

        (data.players || []).forEach(player => {
            if (player.role === 'player1') {
                const el = document.getElementById('nom-joueur1'); if (el) el.textContent = player.name;
                const elF = document.getElementById('final-nom1'); if (elF) elF.textContent = player.name;
                if (player.socketId === this.socket.id) {
                    this.playerRole = 'player1';
                    const roleEl = document.getElementById('role-indicator'); if (roleEl) { roleEl.textContent = `Vous êtes ${player.name} (Joueur 1)`; roleEl.className = 'badge bg-primary'; }
                }
            } else if (player.role === 'player2') {
                const el = document.getElementById('nom-joueur2'); if (el) el.textContent = player.name;
                const elF = document.getElementById('final-nom2'); if (elF) elF.textContent = player.name;
                if (player.socketId === this.socket.id) {
                    this.playerRole = 'player2';
                    const roleEl = document.getElementById('role-indicator'); if (roleEl) { roleEl.textContent = `Vous êtes ${player.name} (Joueur 2)`; roleEl.className = 'badge bg-success'; }
                }
            }
        });

        this.updateScores(data.scores || { player1: 0, player2: 0 });
        this.updateTurnIndicator();
        this.updateProgressBar(data.matchedPairs || 0, data.totalPairs || 8);
    }

    updateScores(scores) {
        const s1 = document.getElementById('score-joueur1'); if (s1) s1.textContent = scores.player1 || 0;
        const s2 = document.getElementById('score-joueur2'); if (s2) s2.textContent = scores.player2 || 0;
        const f1 = document.getElementById('final-score1'); if (f1) f1.textContent = scores.player1 || 0;
        const f2 = document.getElementById('final-score2'); if (f2) f2.textContent = scores.player2 || 0;
    }

    updateTurnIndicator() {
        const tourText = document.getElementById('tour-text');
        const tourIndicator = document.getElementById('tour-indicator');
        if (!tourText || !tourIndicator) return;

        if (this.gameState === 'waiting') {
            tourText.textContent = 'En attente d\'un adversaire...';
            tourIndicator.className = 'alert alert-warning mb-0';
        } else if (this.currentPlayer === this.playerRole) {
            tourText.textContent = '🎮 C\'est votre tour !';
            tourIndicator.className = 'alert alert-success mb-0';
        } else {
            tourText.textContent = '⏳ Tour de l\'adversaire...';
            tourIndicator.className = 'alert alert-secondary mb-0';
        }
    }

    updateProgressBar(matched, total) {
        const percentage = (total === 0) ? 0 : (matched / total) * 100;
        const progressBar = document.getElementById('progress-bar');
        const progressText = document.getElementById('progress-text');
        if (progressBar) progressBar.style.width = `${percentage}%`;
        if (progressText) progressText.textContent = `${matched}/${total} paires trouvées`;

        if (progressBar) {
            if (percentage < 50) progressBar.className = 'progress-bar progress-bar-striped progress-bar-animated bg-warning';
            else if (percentage < 100) progressBar.className = 'progress-bar progress-bar-striped progress-bar-animated bg-info';
            else progressBar.className = 'progress-bar progress-bar-striped progress-bar-animated bg-success';
        }
    }

    generateGameBoard() {
        const gameBoard = document.getElementById('game-board');
        if (!gameBoard) return;
        gameBoard.innerHTML = '';

        for (let i = 0; i < 16; i++) {
            const card = document.createElement('div');
            card.className = 'carte';
            card.dataset.index = i;
            card.innerHTML = `\n                <div class="carte-inner">\n                    <div class="carte-face carte-recto">?</div>\n                    <div class="carte-face carte-verso">?</div>\n                </div>\n            `;
            card.addEventListener('click', () => this.flipCard(i));
            gameBoard.appendChild(card);
        }

        this.updateCardsState();
    }

    updateCardsState() {
        const cards = document.querySelectorAll('.carte');
        cards.forEach((card, index) => {
            const cardState = this.cardsState[index];
            card.classList.remove('carte-retournee', 'carte-trouvee', 'carte-player1', 'carte-player2');
            const recto = card.querySelector('.carte-recto');
            if (cardState && cardState.matched) {
                card.classList.add('carte-trouvee', `carte-${cardState.player}`);
                if (recto) recto.textContent = '✓';
            } else if (this.flippedCards.includes(index)) {
                card.classList.add('carte-retournee');
            } else {
                if (recto) recto.textContent = '?';
            }
        });
    }

    flipCard(cardIndex) {
        if (this.gameState !== 'playing') { this.showMessage('La partie n\'a pas encore commencé'); return; }
        if (this.currentPlayer !== this.playerRole) { this.showMessage('Ce n\'est pas votre tour'); return; }
        if (this.flippedCards.includes(cardIndex)) return;
        const cardState = this.cardsState[cardIndex]; if (cardState && cardState.matched) return;

        this.socket.emit('retourner-carte', { roomCode: this.roomCode, cardIndex });
    }

    showCard(cardIndex, value, player) {
        const card = document.querySelector(`.carte[data-index="${cardIndex}"]`);
        if (!card) return;
        card.classList.add('carte-retournee');
        const recto = card.querySelector('.carte-recto'); if (recto) recto.textContent = value;
        card.style.border = player === 'player1' ? '2px solid #007bff' : '2px solid #28a745';
    }

    markCardsAsMatched(card1Index, card2Index, player) {
        const c1 = document.querySelector(`.carte[data-index="${card1Index}"]`);
        const c2 = document.querySelector(`.carte[data-index="${card2Index}"]`);
        if (c1 && c2) {
            c1.classList.add('carte-trouvee', `carte-${player}`);
            c2.classList.add('carte-trouvee', `carte-${player}`);
            const r1 = c1.querySelector('.carte-recto'); if (r1) r1.textContent = '✓';
            const r2 = c2.querySelector('.carte-recto'); if (r2) r2.textContent = '✓';
            c1.style.border = 'none'; c2.style.border = 'none';
        }
    }

    hideCards(card1Index, card2Index) {
        const c1 = document.querySelector(`.carte[data-index="${card1Index}"]`);
        const c2 = document.querySelector(`.carte[data-index="${card2Index}"]`);
        if (c1 && c2) { c1.classList.remove('carte-retournee'); c2.classList.remove('carte-retournee'); c1.style.border = 'none'; c2.style.border = 'none'; }
    }

    switchTurn(nouveauJoueur) { this.currentPlayer = nouveauJoueur; this.updateTurnIndicator(); }

    handleTimerStart(data) {
        // data: { duration, currentPlayer, startedAt }
        const countdownEl = document.getElementById('countdown');
        const timerRoot = document.getElementById('timer');
        const fg = document.querySelector('.timer-fg');
        if (!countdownEl || !timerRoot || !fg) return;

        const duration = data.duration || 10;
        const start = data.startedAt || Date.now();

    // circle radius is 30 in the SVG; circumference = 2 * PI * r
    const radius = 30;
    const circumference = 2 * Math.PI * radius;

        const tick = () => {
            const elapsed = (Date.now() - start) / 1000;
            const remaining = Math.max(0, Math.ceil(duration - elapsed));
            countdownEl.textContent = remaining;

            const ratio = Math.max(0, Math.min(1, 1 - elapsed / duration));
            const offset = circumference * (1 - ratio);
            // update stroke-dashoffset (because SVG rotated -90deg, offset visually shows proper progress)
            fg.style.strokeDashoffset = `${offset}`;

            // low-time visual cue
            if (remaining <= 3) {
                timerRoot.classList.add('timer-danger');
                timerRoot.classList.add('pulse');
                fg.style.stroke = '#ff4d4d';
            } else {
                timerRoot.classList.remove('timer-danger');
                timerRoot.classList.remove('pulse');
                fg.style.stroke = 'url(#g1)';
            }

            if (remaining <= 0) {
                if (this._countdownInterval) { clearInterval(this._countdownInterval); this._countdownInterval = null; }
                // pop animation + short sound feedback
                try {
                    timerRoot.classList.add('timer-pop');
                    setTimeout(() => timerRoot.classList.remove('timer-pop'), 700);
                    // short click/pop using WebAudio
                    const ctx = new (window.AudioContext || window.webkitAudioContext)();
                    const o = ctx.createOscillator();
                    const g = ctx.createGain();
                    o.type = 'sine';
                    o.frequency.setValueAtTime(600, ctx.currentTime);
                    g.gain.setValueAtTime(0.001, ctx.currentTime);
                    g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.01);
                    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
                    o.connect(g); g.connect(ctx.destination);
                    o.start(); o.stop(ctx.currentTime + 0.23);
                } catch (e) {
                    // ignore audio errors
                }
            }
        };

        // initialize stroke-dasharray/dashoffset
        fg.style.strokeDasharray = `${circumference}`;
        fg.style.strokeDashoffset = `0`;

        if (this._countdownInterval) clearInterval(this._countdownInterval);
        this._countdownInterval = setInterval(tick, 200);
        // run immediately once
        tick();
    }

    showGameResult(data) {
        let message = '';
        if (data.gagnant === 'égalité') message = '🤝 Match nul !';
        else if (data.gagnant === this.playerRole) message = '🎉 Vous avez gagné !';
        else message = '😞 Vous avez perdu...';

        const msgEl = document.getElementById('message-resultat'); if (msgEl) msgEl.textContent = message;
        const modal = new bootstrap.Modal(document.getElementById('finPartieModal')); if (modal) modal.show();
    }

    copyRoomCode() { if (!this.roomCode) return; navigator.clipboard.writeText(this.roomCode).then(() => this.showMessage('✅ Code copié dans le presse-papier !')); }

    showMessage(message) {
        const container = document.getElementById('toast-container') || (() => { const c = document.createElement('div'); c.id = 'toast-container'; c.className = 'position-fixed top-0 end-0 p-3'; c.style.zIndex = '9999'; document.body.appendChild(c); return c; })();
        const toastEl = document.createElement('div'); toastEl.className = 'toast show'; toastEl.innerHTML = `\n            <div class="toast-header">\n                <strong class="me-auto">Memory</strong>\n                <button type="button" class="btn-close" data-bs-dismiss="toast"></button>\n            </div>\n            <div class="toast-body">${message}</div>\n        `;
        container.appendChild(toastEl);
        setTimeout(() => toastEl.remove(), 3000);
    }
}

document.addEventListener('DOMContentLoaded', () => new MemoryMultiplayer());