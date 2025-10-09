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
// accept JSON bodies and also text bodies (beacon sends text/plain)
app.use(express.json());
app.use(express.text({ type: '*/*' }));

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

// Endpoint to collect lightweight performance telemetry from clients (beacon-friendly)
app.post('/perf-collect', (req, res) => {
  try {
    let body = req.body;
    // if text was sent, try to parse as JSON
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { /* keep string */ }
    }
    // Basic validation and logging — push to logs for now
    console.log('perf-collect', body && body.type ? body.type : 'unknown', body || {});
    // respond quickly
    res.status(204).end();
  } catch (e) {
    res.status(500).json({ error: 'invalid payload' });
  }
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

  // perf ping from client -> reply quickly so client can measure RTT
  socket.on('perf-ping', (payload) => {
    try {
      // echo back minimal payload
      socket.emit('perf-pong', { id: payload.id, ts: payload.ts });
    } catch (e) {}
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