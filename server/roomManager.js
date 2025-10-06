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
      totalPairs: 8
    };
    
    this.rooms.set(roomCode, room);
    console.log(`🎮 Salle créée: ${roomCode}`);
    // Planifier une suppression absolue après 10 minutes (durée de validité)
    const TEN_MINUTES = 10 * 60 * 1000;
    this.scheduleRoomDeletion(roomCode, TEN_MINUTES, true);
    return roomCode;
  }

  generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
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
    return this.rooms.get(roomCode);
  }

  addPlayerToRoom(roomCode, player) {
    const room = this.getRoom(roomCode);
    if (!room) return false;
    // Si une suppression était programmée pour cette salle, annuler
    this.cancelRoomDeletion(roomCode);
    // Si playerId fourni et correspond à un joueur existant, le reconnecter
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

    // Réutiliser un slot déconnecté si disponible
    const disconnectedSlot = room.players.find(p => !p.socketId);
    if (disconnectedSlot) {
      disconnectedSlot.socketId = player.socketId;
      disconnectedSlot.name = player.name || disconnectedSlot.name || 'Joueur';
      if (player.playerId) disconnectedSlot.playerId = player.playerId;
      disconnectedSlot.disconnectedAt = null;
      console.log(`🔁 Réutilisation d'un slot déconnecté pour ${disconnectedSlot.name} dans ${roomCode}`);
      return true;
    }

    // Sinon, ajouter un nouveau joueur si la salle n'est pas pleine
    const activeSlots = room.players.length;
    if (activeSlots < 2) {
      // Déterminer le rôle disponible
      const hasPlayer1 = room.players.some(p => p.role === 'player1');
      const hasPlayer2 = room.players.some(p => p.role === 'player2');

      if (!hasPlayer1) {
        player.role = 'player1';
        player.name = player.name || 'Joueur 1';
      } else if (!hasPlayer2) {
        player.role = 'player2';
        player.name = player.name || 'Joueur 2';
        room.gameState = 'playing';
        // Choose a starting player among connected players (prefer an actually connected slot)
        const connected = room.players.find(p => p.socketId) || player;
        room.currentPlayer = connected.role || player.role || 'player1';
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

    // Si la partie était en cours et que le joueur déconnecté était en train de jouer,
    // passer le tour à l'adversaire connecté (s'il y en a un). Sinon repasser en attente.
    if (room.gameState === 'playing' && player) {
      // Si le joueur déconnecté était le joueur courant
      if (room.currentPlayer === player.role) {
        const other = room.players.find(p => p.role && p.role !== player.role);
        if (other && other.socketId) {
          room.currentPlayer = other.role;
          console.log(`➡️ Le tour passe à ${other.name} (${other.role}) dans ${roomCode} après la déconnexion de ${player.name}`);
        } else {
          // Aucun adversaire connecté, remettre la salle en attente
          room.gameState = 'waiting';
          room.currentPlayer = null;
          console.log(`⏸️ La salle ${roomCode} repasse en attente (seul joueur restant)`);
        }
      }
    }

    // Si aucun joueur connecté, programmer suppression après délai
    const anyConnected = room.players.some(p => p.socketId);
    if (!anyConnected) {
      this.scheduleRoomDeletion(roomCode);
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
    if (this.reapTimers.has(roomCode)) return; // déjà programmé
    console.log(`⏳ Programmation suppression de la salle ${roomCode} dans ${delayMs/1000}s` + (force ? ' (FORCE)' : ''));
    const t = setTimeout(() => {
      const room = this.getRoom(roomCode);
      if (!room) {
        this.reapTimers.delete(roomCode);
        return;
      }
      if (force) {
        // suppression forcée quelle que soit l'occupation
        this.rooms.delete(roomCode);
        console.log(`🗑️ Salle ${roomCode} supprimée (expiration de validité)`);
      } else {
        if (room.players.length === 0) {
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