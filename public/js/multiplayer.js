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

        // perf & protection state
        this._lastFlipTime = 0; // ms timestamp of last flip to avoid extremely rapid clicks
        this._flipCooldownMs = 120; // debounce rapid clicks
        this._countdownRaf = null;
        this._delegatedClickBound = false;
        this._perf = { frames: 0, lastTime: performance.now(), fps: 0, frameTimes: [] };

        this.init();
    }

    init() {
        this.setupSocketEvents();
        this.setupUIEvents();
        this.loadRoomFromURL();
        // start lightweight perf instrumentation and periodic ping
        try { this.initPerf(); this.startPing(); } catch (e) { /* non-fatal */ }
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
        // reply from server for perf ping
        this.socket.on('perf-pong', (payload) => {
            try {
                if (payload && payload.id && payload.ts) {
                    const rtt = Date.now() - payload.ts;
                    navigator.sendBeacon?.('/perf-collect', JSON.stringify({ type: 'rtt', rtt, ts: Date.now() }));
                }
            } catch (e) {}
        });
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
        // Build cards using a fragment to minimize reflows.
        const frag = document.createDocumentFragment();
        const total = 16;
        for (let i = 0; i < total; i++) {
            const card = document.createElement('div');
            card.className = 'carte';
            card.dataset.index = i;
            card.innerHTML = `\n                <div class="carte-inner">\n                    <div class="carte-face carte-recto">?</div>\n                    <div class="carte-face carte-verso">?</div>\n                </div>\n            `;
            frag.appendChild(card);
        }
        gameBoard.innerHTML = '';
        gameBoard.appendChild(frag);

        // attach a single delegated click handler to avoid many listeners
        if (!this._delegatedClickBound) {
            gameBoard.addEventListener('click', (e) => {
                const cardEl = e.target.closest('.carte');
                if (!cardEl) return;
                const idx = Number(cardEl.dataset.index);
                const now = Date.now();
                if (now - this._lastFlipTime < this._flipCooldownMs) return;
                this._lastFlipTime = now;
                this.flipCard(idx);
            });
            this._delegatedClickBound = true;
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

        fg.style.strokeDasharray = `${circumference}`;
        fg.style.strokeDashoffset = `0`;

        // cancel previous RAF if any
        if (this._countdownRaf) { cancelAnimationFrame(this._countdownRaf); this._countdownRaf = null; }

        const rafTick = () => {
            const elapsed = (Date.now() - start) / 1000;
            const remaining = Math.max(0, Math.ceil(duration - elapsed));
            countdownEl.textContent = remaining;

            const ratio = Math.max(0, Math.min(1, 1 - elapsed / duration));
            const offset = circumference * (1 - ratio);
            fg.style.strokeDashoffset = `${offset}`;

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
                try {
                    timerRoot.classList.add('timer-pop');
                    setTimeout(() => timerRoot.classList.remove('timer-pop'), 700);
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
                } catch (e) {}
                return;
            }

            this._countdownRaf = requestAnimationFrame(rafTick);
        };

        this._countdownRaf = requestAnimationFrame(rafTick);
    }

    // initialize lightweight perf instrumentation
    initPerf() {
        const perf = this._perf;
        let lastRAF = performance.now();
        const loop = (ts) => {
            perf.frames++;
            const dt = ts - lastRAF;
            lastRAF = ts;
            perf.frameTimes.push(dt);
            if (perf.frameTimes.length > 600) perf.frameTimes.shift();

            const now = performance.now();
            if (now - perf.lastTime >= 1000) {
                perf.fps = perf.frames;
                perf.frames = 0;
                perf.lastTime = now;
                try { navigator.sendBeacon?.('/perf-collect', JSON.stringify({ type: 'perf', fps: perf.fps, medianFrame: median(perf.frameTimes), ts: Date.now() })); } catch (e) {}
            }
            requestAnimationFrame(loop);
        };
        function median(arr){ if(!arr || !arr.length) return 0; const s = arr.slice().sort((a,b)=>a-b); return s[Math.floor(s.length/2)]; }
        requestAnimationFrame(loop);

        // event-loop lag detector
        setInterval(() => {
            const start = Date.now();
            setTimeout(() => {
                const lag = Date.now() - start - 0;
                if (lag > 80) navigator.sendBeacon?.('/perf-collect', JSON.stringify({ type: 'lag', lag, ts: Date.now() }));
            }, 0);
        }, 2000);
    }

    startPing() {
        if (this._pingInterval) return;
        this._pingInterval = setInterval(() => {
            try { const id = Math.random().toString(36).slice(2,9); this.socket.emit('perf-ping', { id, ts: Date.now() }); } catch (e) {}
        }, 5000);
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
        const container = document.getElementById('toast-container') || (() => {
            const c = document.createElement('div');
            c.id = 'toast-container';
            c.className = 'position-fixed top-0 end-0 p-3';
            c.style.zIndex = '9999';
            c.setAttribute('aria-live', 'polite');
            document.body.appendChild(c);
            return c;
        })();

        const toastEl = document.createElement('div');
        toastEl.className = 'toast show align-items-center text-wrap';
        toastEl.setAttribute('role', 'status');
        toastEl.style.minWidth = '220px';
        toastEl.style.background = 'linear-gradient(90deg,#0b1220,#0f2946)';
        toastEl.style.color = '#fff';
        toastEl.style.border = '1px solid rgba(255,255,255,0.04)';
        toastEl.innerHTML = `
            <div class="d-flex">
              <div class="toast-body">${message}</div>
              <button type="button" class="btn-close btn-close-white ms-2 me-1" aria-label="Fermer"></button>
            </div>
        `;
        container.appendChild(toastEl);
        const btn = toastEl.querySelector('.btn-close'); if (btn) btn.addEventListener('click', () => toastEl.remove());
        setTimeout(() => toastEl.remove(), 3000);
    }
}

document.addEventListener('DOMContentLoaded', () => new MemoryMultiplayer());