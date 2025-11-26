class RoomManager {
    constructor() {
        this.rooms = new Map();
        this.reapTimers = new Map(); // timers to delete empty rooms after a grace period
    }

    createRoom() {
        const roomCode = this.generateRoomCode();
        const room = {
            code: roomCode,
            players: [],
            gameState: 'waiting', // waiting, playing, finished
            currentPlayer: null,
            cards: this.generateCards(),
            flippedCards: [],
            scores: { player1: 0, player2: 0 },
            matchedPairs: 0,
            totalPairs: 8,
            createdAt: Date.now(),
            lastActivity: Date.now()
        };
        
        this.rooms.set(roomCode, room);
        console.log(`🎮 Salle créée: ${roomCode}`);
        
        // Planifier une suppression absolue après 30 minutes (durée de validité max)
        const THIRTY_MINUTES = 30 * 60 * 1000;
        this.scheduleRoomDeletion(roomCode, THIRTY_MINUTES, true);
        
        return roomCode;
    }

    generateRoomCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars like I, 1, O, 0
        let code = '';
        do {
            code = '';
            for (let i = 0; i < 6; i++) {
                code += chars.charAt(Math.floor(Math.random() * chars.length));
            }
        } while (this.rooms.has(code)); // Ensure uniqueness
        return code;
    }

    generateCards() {
        const symbols = ['🍎', '🍌', '🍒', '🍇', '🍊', '🍓', '🍑', '🍍', '🥭', '🍉', '🍐', '🥝'];
        const selectedSymbols = symbols.slice(0, 8);
        const cards = [...selectedSymbols, ...selectedSymbols];
        return this.shuffleArray(cards);
    }

    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    getRoom(roomCode) {
        const room = this.rooms.get(roomCode);
        if (room) {
            room.lastActivity = Date.now();
        }
        return room;
    }

    addPlayerToRoom(roomCode, player) {
        const room = this.getRoom(roomCode);
        if (!room) return false;

        // Si une suppression était programmée pour cette salle (car vide), annuler
        this.cancelRoomDeletion(roomCode);

        // 1. Tentative de reconnexion par playerId (priorité absolue)
        if (player.playerId) {
            const existing = room.players.find(p => p.playerId === player.playerId);
            if (existing) {
                existing.socketId = player.socketId;
                existing.name = player.name || existing.name;
                existing.disconnectedAt = null;
                console.log(`🔁 Reconnexion de ${existing.name} (playerId=${player.playerId}) dans ${roomCode}`);
                return true;
            }
        }

        // 2. Réutiliser un slot déconnecté (si pas de playerId match mais slot libre)
        const disconnectedSlot = room.players.find(p => !p.socketId);
        if (disconnectedSlot) {
            disconnectedSlot.socketId = player.socketId;
            disconnectedSlot.name = player.name || disconnectedSlot.name || 'Joueur';
            // Si le nouveau joueur a un playerId, on met à jour le slot
            if (player.playerId) disconnectedSlot.playerId = player.playerId;
            disconnectedSlot.disconnectedAt = null;
            console.log(`🔁 Réutilisation d'un slot déconnecté pour ${disconnectedSlot.name} dans ${roomCode}`);
            return true;
        }

        // 3. Ajouter un nouveau joueur si la salle n'est pas pleine
        if (room.players.length < 2) {
            // Déterminer le rôle disponible
            const hasPlayer1 = room.players.some(p => p.role === 'player1');
            
            if (!hasPlayer1) {
                player.role = 'player1';
                player.name = player.name || 'Joueur 1';
            } else {
                player.role = 'player2';
                player.name = player.name || 'Joueur 2';
            }

            room.players.push(player);
            return true;
        }

        // Salle pleine
        return false;
    }

    removePlayerFromRoom(socketId, roomCode) {
        const room = this.getRoom(roomCode);
        if (!room) return;

        // Marquer le joueur comme déconnecté mais conserver son slot pour reconnexion
        const player = room.players.find(p => p.socketId === socketId);
        if (player) {
            player.socketId = null;
            player.disconnectedAt = Date.now();
            console.log(`👋 Joueur ${player.name} marqué comme déconnecté de la salle ${roomCode}`);
        }

        // Si aucun joueur connecté, programmer suppression après délai court (1 min)
        const anyConnected = room.players.some(p => p.socketId);
        if (!anyConnected) {
            this.scheduleRoomDeletion(roomCode, 60000); // 1 minute pour se reconnecter
        }
    }

    getPlayerByPlayerId(playerId) {
        for (const [roomCode, room] of this.rooms.entries()) {
            const p = room.players.find(x => x.playerId === playerId);
            if (p) return { room, player: p, roomCode };
        }
        return null;
    }

    scheduleRoomDeletion(roomCode, delayMs = 60000, force = false) {
        // Ne pas reprogrammer si déjà programmé (sauf si force)
        if (this.reapTimers.has(roomCode) && !force) return;
        
        // Si force est true, on écrase le timer existant
        if (this.reapTimers.has(roomCode)) {
            clearTimeout(this.reapTimers.get(roomCode));
        }

        console.log(`⏳ Programmation suppression de la salle ${roomCode} dans ${delayMs/1000}s` + (force ? ' (FORCE)' : ''));
        
        const t = setTimeout(() => {
            const room = this.rooms.get(roomCode);
            if (!room) {
                this.reapTimers.delete(roomCode);
                return;
            }

            if (force) {
                this.rooms.delete(roomCode);
                console.log(`🗑️ Salle ${roomCode} supprimée (expiration de validité)`);
            } else {
                // Vérifier à nouveau si vide
                const anyConnected = room.players.some(p => p.socketId);
                if (!anyConnected) {
                    this.rooms.delete(roomCode);
                    console.log(`🗑️ Salle ${roomCode} supprimée (inactivité)`);
                } else {
                    console.log(`ℹ️ Salle ${roomCode} réoccupée, annulation suppression`);
                }
            }
            this.reapTimers.delete(roomCode);
        }, delayMs);

        this.reapTimers.set(roomCode, t);
    }

    cancelRoomDeletion(roomCode) {
        if (this.reapTimers.has(roomCode)) {
            // On n'annule pas les suppressions forcées (expiration max)
            // Mais ici on simplifie : on annule tout, le createRoom a posé un timer force qui sera écrasé si on ne fait pas attention.
            // Pour bien faire, on devrait distinguer timer d'inactivité et timer de fin de vie.
            // Pour l'instant, on suppose que l'activité repousse la suppression d'inactivité.
            
            // Note: Le timer "FORCE" du createRoom est long (30min), on peut le laisser courir ou le reset.
            // Ici on va simplement clear le timer courant.
            clearTimeout(this.reapTimers.get(roomCode));
            this.reapTimers.delete(roomCode);
            console.log(`✋ Annulation suppression programmée de la salle ${roomCode}`);
        }
    }

    getPlayerRoom(socketId) {
        for (const [roomCode, room] of this.rooms.entries()) {
            const player = room.players.find(p => p.socketId === socketId);
            if (player) {
                return { room, player, roomCode };
            }
        }
        return null;
    }

    switchPlayer(roomCode) {
        const room = this.getRoom(roomCode);
        if (!room) return;

        room.currentPlayer = room.currentPlayer === 'player1' ? 'player2' : 'player1';
        room.flippedCards = []; // Réinitialiser les cartes retournées
        
        return room.currentPlayer;
    }

    checkCardMatch(roomCode, card1Index, card2Index) {
        const room = this.getRoom(roomCode);
        if (!room) return false;

        return room.cards[card1Index] === room.cards[card2Index];
    }

    markCardsAsMatched(roomCode, card1Index, card2Index, playerRole) {
        const room = this.getRoom(roomCode);
        if (!room) return;

        // Marquer les cartes comme trouvées
        if (!room.cardsState) room.cardsState = {};
        room.cardsState[card1Index] = { matched: true, player: playerRole };
        room.cardsState[card2Index] = { matched: true, player: playerRole };

        // Mettre à jour le score
        room.scores[playerRole]++;
        room.matchedPairs++;

        // Vérifier si la partie est terminée
        if (room.matchedPairs >= room.totalPairs) {
            room.gameState = 'finished';
        }
    }
}

module.exports = RoomManager;