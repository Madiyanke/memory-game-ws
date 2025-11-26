const TURN_DURATION = 30;

class GameManager {
    constructor(roomManager, io) {
        this.roomManager = roomManager;
        this.io = io;
        this.roomTimers = new Map(); // per-room turn timers
    }

    joinRoom(socket, roomCode, playerName, playerId = null) {
        // Vérifier si le joueur est déjà dans une salle
        const existingRoom = this.roomManager.getPlayerRoom(socket.id);
        if (existingRoom) {
            // Si c'est la même salle, on ignore (ou on renvoie l'état)
            if (existingRoom.roomCode === roomCode) {
                this.sendRoomState(roomCode);
                return;
            }
            socket.emit('erreur', { message: 'Vous êtes déjà dans une salle' });
            return;
        }

        const room = this.roomManager.getRoom(roomCode);
        if (!room) {
            socket.emit('erreur', { message: 'Salle introuvable' });
            return;
        }

        // Create player object
        const player = {
            socketId: socket.id,
            name: playerName,
            role: null,
            playerId: playerId || null
        };

        const success = this.roomManager.addPlayerToRoom(roomCode, player);
        if (!success) {
            socket.emit('salle_pleine', { message: 'Salle pleine - Maximum 2 joueurs autorisés' });
            return;
        }

        socket.join(roomCode);
        socket.room = roomCode;

        // Find the actual player object stored in the room
        const roomRef = this.roomManager.getRoom(roomCode);
        const joinedPlayer = roomRef.players.find(p => p.socketId === socket.id);

        console.log(`👤 ${joinedPlayer.name} a rejoint la salle ${roomCode} en tant que ${joinedPlayer.role} `);

        // Informer tous les joueurs de la salle
        this.sendRoomState(roomCode);

        // Si 2 joueurs connectés, démarrer la partie si pas déjà en cours
        const connectedCount = room.players.filter(p => p.socketId).length;
        if (connectedCount === 2 && room.gameState === 'waiting') {
            this.startGame(roomCode);
        } else if (room.gameState === 'playing') {
            // Si la partie est déjà en cours (reconnexion), renvoyer l'état du timer
            // TODO: Sync timer logic if needed
        }
    }

    startGame(roomCode) {
        const room = this.roomManager.getRoom(roomCode);
        if (!room) return;

        room.gameState = 'playing';
        // Player 1 starts by default unless specified otherwise
        room.currentPlayer = 'player1';

        console.log(`🎲 Début de la partie dans la salle ${roomCode} `);
        this.sendRoomState(roomCode);
        this.startTurnTimer(roomCode);
    }

    flipCard(socket, roomCode, cardIndex) {
        const roomData = this.roomManager.getPlayerRoom(socket.id);
        if (!roomData) return;

        const { room, player } = roomData;

        // Validations strictes
        if (room.gameState !== 'playing') return;
        if (room.currentPlayer !== player.role) return;
        if (room.flippedCards.length >= 2) return; // Déjà 2 cartes retournées
        if (room.flippedCards.includes(cardIndex)) return; // Carte déjà retournée
        if (room.cardsState && room.cardsState[cardIndex] && room.cardsState[cardIndex].matched) return; // Carte déjà trouvée

        // Retourner la carte
        room.flippedCards.push(cardIndex);

        // Émettre l'événement à tous les joueurs
        this.io.to(roomCode).emit('carte-retournee', {
            cardIndex,
            value: room.cards[cardIndex],
            player: player.role
        });

        // Vérifier si deux cartes sont retournées
        if (room.flippedCards.length === 2) {
            this.checkCardMatch(roomCode);
        }
    }

    checkCardMatch(roomCode) {
        const room = this.roomManager.getRoom(roomCode);
        if (!room || room.flippedCards.length !== 2) return;

        const [card1Index, card2Index] = room.flippedCards;
        const isMatch = this.roomManager.checkCardMatch(roomCode, card1Index, card2Index);

        // Petit délai pour laisser voir la 2ème carte
        setTimeout(() => {
            if (isMatch) {
                this.handleMatch(room, roomCode, card1Index, card2Index);
            } else {
                this.handleMismatch(room, roomCode, card1Index, card2Index);
            }
        }, 1000);
    }

    handleMatch(room, roomCode, card1Index, card2Index) {
        // Marquer comme trouvées
        this.roomManager.markCardsAsMatched(roomCode, card1Index, card2Index, room.currentPlayer);

        this.io.to(roomCode).emit('paire-trouvee', {
            card1Index,
            card2Index,
            player: room.currentPlayer,
            scores: room.scores
        });

        room.flippedCards = [];

        if (room.gameState === 'finished') {
            this.endGame(roomCode);
        } else {
            // Le joueur rejoue, on redémarre le timer
            this.startTurnTimer(roomCode);
        }
    }

    handleMismatch(room, roomCode, card1Index, card2Index) {
        // Cacher les cartes
        this.io.to(roomCode).emit('cacher-cartes', {
            card1Index,
            card2Index
        });

        room.flippedCards = [];

        // Changer de joueur
        const newPlayer = this.roomManager.switchPlayer(roomCode);
        this.io.to(roomCode).emit('changement-tour', { nouveauJoueur: newPlayer });

        this.startTurnTimer(roomCode);
        this.sendRoomState(roomCode);
    }

    startTurnTimer(roomCode) {
        this.clearTurnTimer(roomCode);

        const room = this.roomManager.getRoom(roomCode);
        if (!room || room.gameState !== 'playing') return;

        const startedAt = Date.now();

        // Sync timer avec les clients
        this.io.to(roomCode).emit('timer-start', {
            duration: TURN_DURATION,
            currentPlayer: room.currentPlayer,
            startedAt
        });

        const t = setTimeout(() => {
            this.onTurnTimeout(roomCode);
        }, TURN_DURATION * 1000);

        this.roomTimers.set(roomCode, t);
    }

    clearTurnTimer(roomCode) {
        if (this.roomTimers.has(roomCode)) {
            clearTimeout(this.roomTimers.get(roomCode));
            this.roomTimers.delete(roomCode);
        }
    }

    onTurnTimeout(roomCode) {
        const room = this.roomManager.getRoom(roomCode);
        if (!room) return;

        // Si des cartes étaient retournées, on les cache
        if (room.flippedCards.length > 0) {
            this.io.to(roomCode).emit('cacher-cartes', {
                card1Index: room.flippedCards[0],
                card2Index: room.flippedCards[1] // peut être undefined si 1 seule carte
            });
            room.flippedCards = [];
        }

        // Changer de joueur
        const newPlayer = this.roomManager.switchPlayer(roomCode);
        this.io.to(roomCode).emit('changement-tour-timeout', { nouveauJoueur: newPlayer });

        this.startTurnTimer(roomCode);
        this.sendRoomState(roomCode);
    }

    endGame(roomCode) {
        const room = this.roomManager.getRoom(roomCode);
        if (!room) return;

        this.clearTurnTimer(roomCode);

        let gagnant = 'égalité';
        if (room.scores.player1 > room.scores.player2) gagnant = 'player1';
        else if (room.scores.player2 > room.scores.player1) gagnant = 'player2';

        this.io.to(roomCode).emit('partie-terminee', {
            gagnant,
            scores: room.scores
        });

        console.log(`🏆 Partie terminée dans la salle ${roomCode} `);
    }

    resetGame(roomCode) {
        const room = this.roomManager.getRoom(roomCode);
        if (!room) return;

        // Reset state
        room.cards = this.roomManager.generateCards();
        room.cardsState = {};
        room.flippedCards = [];
        room.scores = { player1: 0, player2: 0 };
        room.matchedPairs = 0;

        // Check connections
        const connectedCount = room.players.filter(p => p.socketId).length;
        if (connectedCount >= 2) {
            this.startGame(roomCode);
        } else {
            room.gameState = 'waiting';
            this.sendRoomState(roomCode);
        }
    }

    sendRoomState(roomCode) {
        const room = this.roomManager.getRoom(roomCode);
        if (!room) return;

        const roomState = {
            code: room.code,
            players: room.players,
            gameState: room.gameState,
            currentPlayer: room.currentPlayer,
            scores: room.scores,
            flippedCards: room.flippedCards,
            flippedValues: room.flippedCards.reduce((acc, idx) => ({ ...acc, [idx]: room.cards[idx] }), {}),
            cardsState: room.cardsState || {},
            matchedPairs: room.matchedPairs,
            totalPairs: room.totalPairs
        };

        this.io.to(roomCode).emit('etat-salle', roomState);
    }

    handleDisconnect(socket) {
        const roomData = this.roomManager.getPlayerRoom(socket.id);
        if (!roomData) return;

        const { room, player, roomCode } = roomData;

        this.roomManager.removePlayerFromRoom(socket.id, roomCode);
        delete socket.room;

        this.io.to(roomCode).emit('joueur-deconnecte', {
            player: player.role,
            message: `${player.name} s'est déconnecté`
        });

        // Si la partie était en cours, on la met en pause ou on attend ?
        // Ici on laisse le RoomManager gérer (il a peut-être switché le tour)
        // Mais on doit s'assurer que le timer est coupé si plus personne ne joue
        const connectedCount = room.players.filter(p => p.socketId).length;
        if (connectedCount < 2) {
            this.clearTurnTimer(roomCode);
            room.gameState = 'waiting'; // Retour en attente
        }

        this.sendRoomState(roomCode);
    }
}

module.exports = GameManager;