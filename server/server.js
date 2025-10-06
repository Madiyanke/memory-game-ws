const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const RoomManager = require('./roomManager');
const GameManager = require('./gameManager');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Servir les fichiers statiques depuis le dossier public
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json());

const roomManager = new RoomManager();

// Routes pour les pages HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/creer-salle', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/creer-salle.html'));
});

app.get('/rejoindre-salle', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/rejoindre-salle.html'));
});

app.get('/jeu', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/jeu.html'));
});

// API pour créer/rejoindre des salles
app.post('/api/creer-salle', (req, res) => {
  const roomCode = roomManager.createRoom();
  res.json({ success: true, roomCode });
});

app.post('/api/rejoindre-salle', (req, res) => {
  const { roomCode } = req.body;
  const room = roomManager.getRoom(roomCode);
  
  if (!room) {
    return res.json({ success: false, error: 'Salle introuvable' });
  }
  // Count connected players (socketId not null)
  const connectedCount = room.players.filter(p => p.socketId).length;
  if (connectedCount >= 2) {
    return res.json({ success: false, error: 'Salle pleine' });
  }
  
  res.json({ success: true, room });
});

// Maintenant que io est initialisé, nous pouvons créer le GameManager
const gameManager = new GameManager(roomManager, io);

// Gestion des connexions WebSocket
io.on('connection', (socket) => {
  console.log('Nouvelle connexion:', socket.id);

  // Rejoindre une salle
  socket.on('rejoindre-salle', (data) => {
    const { roomCode, playerName, playerId } = data;
    gameManager.joinRoom(socket, roomCode, playerName, playerId);
  });

  // Créer et rejoindre: gestion côté socket (optionnel)
  socket.on('creer-salle', (data) => {
    const { roomCode, playerName, playerId } = data;
    // The room has already been created via /api/creer-salle; just join the socket to it
    console.log('création via socket:', roomCode, playerName, playerId);
    gameManager.joinRoom(socket, roomCode, playerName, playerId);
  });

  // Retourner une carte
  socket.on('retourner-carte', (data) => {
    const { roomCode, cardIndex } = data;
    gameManager.flipCard(socket, roomCode, cardIndex);
  });

  // Déconnexion
  socket.on('disconnect', () => {
    console.log('Déconnexion:', socket.id);
    gameManager.handleDisconnect(socket);
  });

  // Redemander l'état de la salle
  socket.on('demander-etat-salle', (roomCode) => {
    gameManager.sendRoomState(roomCode);
  });

  // Demande de rejouer (relancer la même salle sans déconnecter les joueurs)
  socket.on('rejouer', (roomCode) => {
    console.log('Rejouer demandé pour la salle', roomCode, 'par', socket.id);
    gameManager.resetGame(roomCode);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
  console.log(`📱 Accédez au jeu: http://localhost:${PORT}`);
});