class GameManager {
    constructor(roomManager, io) {
        this.roomManager = roomManager;
        this.io = io; 
        this.roomTimers = new Map(); // per-room turn timers
    }

    // Try to reconnect a socket to an existing player slot using playerId
    reconnectByPlayerId(socket, playerId) {
        if (!playerId) return false;
        const found = this.roomManager.getPlayerByPlayerId(playerId);
        if (!found) return false;

        const { room, player, roomCode } = found;
        // Update the player slot with the new socket id
        player.socketId = socket.id;
        player.disconnectedAt = null;

        // Join the socket to the room and store reference
        socket.join(roomCode);
        socket.room = roomCode;

        console.log(`🔁 Reconnexion forcée: ${player.name} (playerId=${playerId}) via socket ${socket.id} dans ${roomCode}`);

        // Send the room state to everyone and also send targeted state to the reconnecting socket
        this.sendRoomState(roomCode);
        this.io.to(socket.id).emit('etat-salle', this.roomManager.getRoom(roomCode));

        return true;
    }

    joinRoom(socket, roomCode, playerName, playerId = null) {
        // Vérifier si le joueur est déjà dans une salle
        const existingRoom = this.roomManager.getPlayerRoom(socket.id);
        if (existingRoom) {
            socket.emit('erreur', { message: 'Vous êtes déjà dans une salle' });
            return;
        }

        // If playerId provided, try to forcibly reconnect to their existing slot
        if (playerId) {
            const reconnected = this.reconnectByPlayerId(socket, playerId);
            if (reconnected) {
                return;
            }
        }

        const room = this.roomManager.getRoom(roomCode);
        
        if (!room) {
            socket.emit('erreur', { message: 'Salle introuvable' });
            return;
        }

        // Create player object (RoomManager.addPlayerToRoom will handle reconnection and slots)
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
        
        // Stocker la salle dans socket pour référence future
        socket.room = roomCode;

        // Find the actual player object stored in the room (it may have been assigned a role or reused)
        const roomRef = this.roomManager.getRoom(roomCode);
        const joinedPlayer = roomRef.players.find(p => p.socketId === socket.id || p.playerId === player.playerId);
        const displayRole = joinedPlayer ? joinedPlayer.role : player.role;
        const displayName = joinedPlayer ? joinedPlayer.name : playerName;
        console.log(`👤 ${displayName} a rejoint la salle ${roomCode} en tant que ${displayRole}`);

        // Informer tous les joueurs de la salle
        this.sendRoomState(roomCode);

        // Si 2 joueurs connectés, démarrer la partie
        const connectedCount = room.players.filter(p => p.socketId).length;
        if (connectedCount === 2) {
            this.startGame(roomCode);
        }
    }

    // Choose a starting player among connected players (prefer first connected slot)
    chooseStartingPlayer(room) {
        if (!room) return null;
        const connected = room.players.find(p => p.socketId);
        if (connected && connected.role) return connected.role;
        // fallback: prefer player1 if present
        if (room.players.some(p => p.role === 'player1')) return 'player1';
        if (room.players.some(p => p.role === 'player2')) return 'player2';
        return null;
    }

    startGame(roomCode) {
        const room = this.roomManager.getRoom(roomCode);
        if (!room) return;

        // Ensure at least two connected players before starting
        const connectedCount = room.players.filter(p => p.socketId).length;
        if (connectedCount < 2) {
            console.log(`⏸️ startGame aborted for ${roomCode}: only ${connectedCount} player(s) connected`);
            room.gameState = 'waiting';
            room.currentPlayer = null;
            this.sendRoomState(roomCode);
            return;
        }

        room.gameState = 'playing';
        const starter = this.chooseStartingPlayer(room) || 'player1';
        room.currentPlayer = starter;

        console.log(`🎲 Début de la partie dans la salle ${roomCode}. Starter: ${starter}`);
        this.sendRoomState(roomCode);
        // Start turn timer
        this.startTurnTimer(roomCode);
    }

    flipCard(socket, roomCode, cardIndex) {
        const roomData = this.roomManager.getPlayerRoom(socket.id);
        if (!roomData) return;

        const { room, player } = roomData;

        // Vérifications
        if (room.gameState !== 'playing') {
            socket.emit('erreur', { message: 'La partie n\'a pas encore commencé' });
            return;
        }

        if (room.currentPlayer !== player.role) {
            socket.emit('erreur', { message: 'Ce n\'est pas votre tour' });
            return;
        }

        // Vérifier si la carte est déjà retournée ou trouvée
        if (room.flippedCards.includes(cardIndex) || 
            (room.cardsState && room.cardsState[cardIndex] && room.cardsState[cardIndex].matched)) {
            return;
        }

        // Retourner la carte
        room.flippedCards.push(cardIndex);
        
        // Émettre l'événement à tous les joueurs de la salle
        this.io.to(roomCode).emit('carte-retournee', { 
            cardIndex, 
            value: room.cards[cardIndex],
            player: player.role
        });

        // Vérifier si deux cartes sont retournées
        if (room.flippedCards.length === 2) {
            this.checkCardMatch(roomCode);
        }

        this.sendRoomState(roomCode);
    }

    checkCardMatch(roomCode) {
        const room = this.roomManager.getRoom(roomCode);
        if (!room || room.flippedCards.length !== 2) return;

        const [card1Index, card2Index] = room.flippedCards;
        const isMatch = this.roomManager.checkCardMatch(roomCode, card1Index, card2Index);

        setTimeout(() => {
            if (isMatch) {
                // Cartes correspondantes
                this.roomManager.markCardsAsMatched(roomCode, card1Index, card2Index, room.currentPlayer);
                
                // Émettre l'événement de correspondance
                this.io.to(roomCode).emit('paire-trouvee', {
                    card1Index,
                    card2Index,
                    player: room.currentPlayer,
                    scores: room.scores
                });

                // Vérifier si la partie est terminée
                if (room.gameState === 'finished') {
                    this.endGame(roomCode);
                    return;
                }

                // Le joueur qui a trouvé une paire rejoue
                // On ne change pas de joueur
                    room.flippedCards = [];
                    // Restart timer for the same player (they have another turn)
                    this.startTurnTimer(roomCode);

            } else {
                // Cartes non correspondantes - changer de joueur
                const newPlayer = this.roomManager.switchPlayer(roomCode);
                    // Start a new turn timer for the new player
                    this.startTurnTimer(roomCode);
                
                // Émettre l'événement de changement de tour
                this.io.to(roomCode).emit('changement-tour', {
                    nouveauJoueur: newPlayer,
                    cartesARetourner: [...room.flippedCards]
                });

                // Cacher les cartes après un délai
                setTimeout(() => {
                    room.flippedCards = [];
                    this.io.to(roomCode).emit('cacher-cartes', {
                        card1Index,
                        card2Index
                    });
                    this.sendRoomState(roomCode);
                }, 1500);
            }

            this.sendRoomState(roomCode);
        }, 1000);
    }

    startTurnTimer(roomCode, duration = 10) {
        // clear existing
        this.clearTurnTimer(roomCode);
        const room = this.roomManager.getRoom(roomCode);
        if (!room) return;

        // Do not start a turn timer if the game hasn't started
        if (room.gameState !== 'playing' || !room.currentPlayer) {
            console.log(`⏸️ Ignoring startTurnTimer for ${roomCode} because gameState=${room.gameState} currentPlayer=${room.currentPlayer}`);
            return;
        }

        const startedAt = Date.now();
        // emit timer-start to sync clients
        this.io.to(roomCode).emit('timer-start', { duration, currentPlayer: room.currentPlayer, startedAt });

        const t = setTimeout(() => {
            this.onTurnTimeout(roomCode);
        }, duration * 1000 + 200); // small buffer
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

        // If fewer than 2 players are connected, stop the game and clear timers
        const connectedCount = room.players.filter(p => p.socketId).length;
        if (connectedCount < 2) {
            console.log(`⏸️ onTurnTimeout for ${roomCode} but only ${connectedCount} player(s) connected — stopping timers and setting waiting`);
            room.gameState = 'waiting';
            room.currentPlayer = null;
            this.clearTurnTimer(roomCode);
            this.sendRoomState(roomCode);
            return;
        }

        // Switch player due to timeout
        const newPlayer = this.roomManager.switchPlayer(roomCode);
        this.io.to(roomCode).emit('changement-tour-timeout', { nouveauJoueur: newPlayer });
        this.sendRoomState(roomCode);
        // start next timer
        this.startTurnTimer(roomCode);
    }

    endGame(roomCode) {
        const room = this.roomManager.getRoom(roomCode);
        if (!room) return;

        // Déterminer le gagnant
        let gagnant = 'égalité';
        if (room.scores.player1 > room.scores.player2) {
            gagnant = 'player1';
        } else if (room.scores.player2 > room.scores.player1) {
            gagnant = 'player2';
        }

        this.io.to(roomCode).emit('partie-terminee', {
            gagnant,
            scores: room.scores,
            player1Name: room.players.find(p => p.role === 'player1')?.name || 'Joueur 1',
            player2Name: room.players.find(p => p.role === 'player2')?.name || 'Joueur 2'
        });

        console.log(`🏆 Partie terminée dans la salle ${roomCode}. Gagnant: ${gagnant}`);
    }

    // Reset and start a new game in the same room without removing players
    resetGame(roomCode) {
        const room = this.roomManager.getRoom(roomCode);
        if (!room) return;

        // Reinitialize cards and state
        room.cards = this.roomManager.generateCards();
        room.cardsState = {};
        room.flippedCards = [];
        room.scores = { player1: 0, player2: 0 };
        room.matchedPairs = 0;

        // Only start playing if at least one player is connected; prefer to start when two connected
        const connectedCount = room.players.filter(p => p.socketId).length;
        if (connectedCount >= 2) {
            room.gameState = 'playing';
            room.currentPlayer = this.chooseStartingPlayer(room) || 'player1';
            // start timer
            this.startTurnTimer(roomCode);
        } else {
            room.gameState = 'waiting';
            room.currentPlayer = null;
            this.clearTurnTimer(roomCode);
        }

        console.log(`🔁 Nouvelle partie lancée dans la salle ${roomCode}`);
        this.sendRoomState(roomCode);
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
        
        // Retirer le joueur de la salle
        this.roomManager.removePlayerFromRoom(socket.id, roomCode);
        
        // Nettoyer la référence de la salle dans socket
        delete socket.room;

        // Informer les autres joueurs
        this.io.to(roomCode).emit('joueur-deconnecte', {
            player: player.role,
            message: `${player.name} s'est déconnecté`
        });

        console.log(`👋 ${player.name} s'est déconnecté de la salle ${roomCode}`);

        // Mettre à jour l'état de la salle
        this.sendRoomState(roomCode);

    // Si aucun joueur connecté, clear any room timer
    const anyConnected = room.players.some(p => p.socketId);
    if (!anyConnected) this.clearTurnTimer(roomCode);

        // Note: RoomManager.scheduleRoomDeletion gère la suppression après une période de grâce
    }

    // Nouvelle méthode pour quitter volontairement une salle
    leaveRoom(socket, roomCode) {
        const roomData = this.roomManager.getPlayerRoom(socket.id);
        if (!roomData) return;

        const { player } = roomData;
        
        // Retirer le joueur de la salle
        this.roomManager.removePlayerFromRoom(socket.id, roomCode);
        
        // Nettoyer la référence de la salle dans socket
        delete socket.room;
        
        socket.leave(roomCode);

        // Informer les autres joueurs
        this.io.to(roomCode).emit('joueur-deconnecte', {
            player: player.role,
            message: `${player.name} a quitté la salle`
        });

        console.log(`👋 ${player.name} a quitté la salle ${roomCode}`);

        // Mettre à jour l'état de la salle
        this.sendRoomState(roomCode);
    }
}

module.exports = GameManager;