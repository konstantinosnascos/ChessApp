// server.js - Unified Game Server
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    pingTimeout: 60000,
    pingInterval: 25000
});

// Serve static files from different game folders
app.use('/chess', express.static('public/chess'));
app.use('/tictactoe', express.static('public/tictactoe'));
app.use('/', express.static('public/lobby'));

// ==================== GAME CONFIGURATIONS ====================
// Add new games here - this is the only place you need to modify!

const GAME_CONFIGS = {
    chess: {
        name: 'Schack',
        minPlayers: 2,
        maxPlayers: 2,
        roles: ['white', 'black'],
        startingPlayer: 'white',
        turnBased: true
    },
    tictactoe: {
        name: '3-i-rad',
        minPlayers: 2,
        maxPlayers: 2,
        roles: ['X', 'O'],
        startingPlayer: 'X',
        turnBased: true
    }
    // Future games - just add config here!
    /*
    fyraIRad: {
        name: 'Fyra i rad',
        minPlayers: 2,
        maxPlayers: 2,
        roles: ['red', 'yellow'],
        startingPlayer: 'red',
        turnBased: true
    },
    uno: {
        name: 'Uno',
        minPlayers: 2,
        maxPlayers: 4,
        roles: ['player1', 'player2', 'player3', 'player4'],
        startingPlayer: 'player1',
        turnBased: true
    },
    ludo: {
        name: 'Fia med knuff',
        minPlayers: 2,
        maxPlayers: 4,
        roles: ['red', 'blue', 'yellow', 'green'],
        startingPlayer: 'red',
        turnBased: true
    }
    */
};

// ==================== DATA STORES ====================

const games = new Map();
const matchmakingQueues = {};
let onlineCount = 0;

// Initialize matchmaking queues for each game type
Object.keys(GAME_CONFIGS).forEach(gameType => {
    matchmakingQueues[gameType] = [];
});

// ==================== HELPER FUNCTIONS ====================

function generateGameId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getGameConfig(gameType) {
    return GAME_CONFIGS[gameType] || null;
}

function createGame(gameType, creatorSocket) {
    const config = getGameConfig(gameType);
    if (!config) return null;
    
    const gameId = generateGameId();
    
    const game = {
        id: gameId,
        type: gameType,
        config: config,
        players: {},
        playerOrder: [],
        moves: [],
        currentPlayerIndex: 0,
        status: 'waiting',
        createdAt: Date.now(),
        rematchRequests: new Set()
    };
    
    // Add creator as first player
    const creatorRole = config.roles[0];
    game.players[creatorSocket.id] = {
        role: creatorRole,
        ready: true
    };
    game.playerOrder.push(creatorSocket.id);
    
    games.set(gameId, game);
    
    // Set up socket
    creatorSocket.join(gameId);
    creatorSocket.gameId = gameId;
    creatorSocket.gameType = gameType;
    creatorSocket.role = creatorRole;
    
    return game;
}

function joinGame(game, socket) {
    const config = game.config;
    const currentPlayerCount = Object.keys(game.players).length;
    
    if (currentPlayerCount >= config.maxPlayers) {
        return { success: false, error: 'Spelet är fullt' };
    }
    
    // Assign next available role
    const takenRoles = Object.values(game.players).map(p => p.role);
    const availableRole = config.roles.find(role => !takenRoles.includes(role));
    
    if (!availableRole) {
        return { success: false, error: 'Inga lediga platser' };
    }
    
    // Add player
    game.players[socket.id] = {
        role: availableRole,
        ready: true
    };
    game.playerOrder.push(socket.id);
    
    // Set up socket
    socket.join(game.id);
    socket.gameId = game.id;
    socket.gameType = game.type;
    socket.role = availableRole;
    
    // Check if game should start
    if (Object.keys(game.players).length >= config.minPlayers) {
        game.status = 'playing';
    }
    
    return { success: true, role: availableRole };
}

function getCurrentPlayer(game) {
    const socketId = game.playerOrder[game.currentPlayerIndex];
    return game.players[socketId]?.role || null;
}

function advanceTurn(game) {
    game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.playerOrder.length;
    return getCurrentPlayer(game);
}

function removeFromMatchmaking(socket, gameType = null) {
    const typesToCheck = gameType ? [gameType] : Object.keys(matchmakingQueues);
    
    typesToCheck.forEach(type => {
        const queue = matchmakingQueues[type];
        const index = queue.findIndex(s => s.id === socket.id);
        if (index !== -1) {
            queue.splice(index, 1);
            console.log(`Removed ${socket.id} from ${type} matchmaking queue`);
        }
    });
}

function tryMatchmaking(gameType) {
    const config = getGameConfig(gameType);
    const queue = matchmakingQueues[gameType];
    
    if (!config || queue.length < config.minPlayers) {
        return null;
    }
    
    // Get enough players for a game
    const matchedPlayers = queue.splice(0, config.maxPlayers);
    
    // Create game with first player
    const game = createGame(gameType, matchedPlayers[0]);
    
    if (!game) {
        // Put players back in queue if game creation failed
        matchmakingQueues[gameType] = [...matchedPlayers, ...queue];
        return null;
    }
    
    // Add remaining players
    for (let i = 1; i < matchedPlayers.length; i++) {
        joinGame(game, matchedPlayers[i]);
    }
    
    game.status = 'playing';
    
    return { game, players: matchedPlayers };
}

function getOnlineStats() {
    const stats = {
        totalOnline: onlineCount,
        queues: {},
        activeGames: {}
    };
    
    Object.keys(GAME_CONFIGS).forEach(type => {
        stats.queues[type] = matchmakingQueues[type].length;
        stats.activeGames[type] = [...games.values()].filter(g => 
            g.type === type && g.status === 'playing'
        ).length;
    });
    
    return stats;
}

// ==================== SOCKET HANDLERS ====================

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);
    
    onlineCount++;
    io.emit('online-stats', getOnlineStats());
    io.emit('online-count', onlineCount); // Bakåtkompatibilitet
    
    // ---------- Get available games ----------
    socket.on('get-game-types', () => {
        const gameTypes = Object.entries(GAME_CONFIGS).map(([key, config]) => ({
            id: key,
            name: config.name,
            minPlayers: config.minPlayers,
            maxPlayers: config.maxPlayers
        }));
        socket.emit('game-types', gameTypes);
    });
    
    // ---------- Create game ----------
    socket.on('create-game', (data = {}) => {
        const gameType = data.gameType || 'chess'; // Default till chess för bakåtkompatibilitet
        const config = getGameConfig(gameType);
        
        if (!config) {
            socket.emit('error', { message: 'Okänd speltyp' });
            return;
        }
        
        // Remove from any matchmaking queue
        removeFromMatchmaking(socket);
        
        const game = createGame(gameType, socket);
        
        if (!game) {
            socket.emit('error', { message: 'Kunde inte skapa spel' });
            return;
        }
        
        socket.emit('game-created', {
            gameId: game.id,
            gameType: gameType,
            role: socket.role,
            color: socket.role, // Bakåtkompatibilitet
            config: {
                name: config.name,
                minPlayers: config.minPlayers,
                maxPlayers: config.maxPlayers,
                currentPlayers: 1
            },
            message: 'Väntar på spelare...'
        });
        
        console.log(`Game ${game.id} (${gameType}) created by ${socket.id}`);
    });
    
    // ---------- Join game ----------
    socket.on('join-game', (data) => {
        // Hantera både { gameId: 'ABC123' } och 'ABC123' för bakåtkompatibilitet
        const gameId = (typeof data === 'string' ? data : data.gameId || '').toUpperCase();
        
        const game = games.get(gameId);
        
        if (!game) {
            socket.emit('error', { message: 'Spelet finns inte' });
            return;
        }
        
        if (game.status === 'finished') {
            socket.emit('error', { message: 'Spelet är avslutat' });
            return;
        }
        
        // Remove from any matchmaking queue
        removeFromMatchmaking(socket);
        
        const result = joinGame(game, socket);
        
        if (!result.success) {
            socket.emit('error', { message: result.error });
            return;
        }
        
        socket.emit('game-joined', {
            gameId: game.id,
            gameType: game.type,
            role: result.role,
            color: result.role, // Bakåtkompatibilitet
            moves: game.moves,
            players: Object.values(game.players).map(p => ({ role: p.role })),
            currentPlayer: getCurrentPlayer(game),
            status: game.status
        });
        
        // Notify other players
        socket.to(game.id).emit('player-joined', {
            role: result.role,
            playerCount: Object.keys(game.players).length,
            maxPlayers: game.config.maxPlayers,
            gameStarted: game.status === 'playing',
            currentPlayer: getCurrentPlayer(game),
            message: 'Motståndare ansluten! Spelet börjar.' // Bakåtkompatibilitet
        });
        
        // Bakåtkompatibilitet: skicka också opponent-joined
        socket.to(game.id).emit('opponent-joined', {
            message: 'Motståndare ansluten! Spelet börjar.'
        });
        
        console.log(`Player ${socket.id} joined game ${gameId} as ${result.role}`);
    });
    
    // ---------- Matchmaking ----------
    socket.on('find-game', (data = {}) => {
        const gameType = data.gameType || 'chess'; // Default till chess
        const config = getGameConfig(gameType);
        
        if (!config) {
            socket.emit('error', { message: 'Okänd speltyp' });
            return;
        }
        
        // Remove from any existing queue first
        removeFromMatchmaking(socket);
        
        // Add to queue
        matchmakingQueues[gameType].push(socket);
        socket.searchingGameType = gameType;
        
        console.log(`Player ${socket.id} searching for ${gameType} game. Queue: ${matchmakingQueues[gameType].length}`);
        
        socket.emit('matchmaking-started', {
            gameType,
            queuePosition: matchmakingQueues[gameType].length,
            playersNeeded: config.minPlayers
        });
        
        // Bakåtkompatibilitet
        socket.emit('waiting-for-opponent', {
            message: 'Väntar på motståndare...'
        });
        
        // Try to match
        const match = tryMatchmaking(gameType);
        
        if (match) {
            match.players.forEach((playerSocket, index) => {
                const playerInfo = match.game.players[playerSocket.id];
                
                playerSocket.emit('game-found', {
                    gameId: match.game.id,
                    gameType: match.game.type,
                    role: playerInfo.role,
                    color: playerInfo.role, // Bakåtkompatibilitet
                    players: Object.values(match.game.players).map(p => ({ role: p.role })),
                    currentPlayer: getCurrentPlayer(match.game),
                    message: `Match hittad! Du spelar som ${playerInfo.role}`
                });
            });
            
            console.log(`Match made for ${gameType}! Game: ${match.game.id}`);
        }
        
        // Update stats
        io.emit('online-stats', getOnlineStats());
    });
    
    socket.on('cancel-search', () => {
        removeFromMatchmaking(socket);
        socket.searchingGameType = null;
        socket.emit('search-cancelled');
        io.emit('online-stats', getOnlineStats());
    });
    
    // ---------- Game moves ----------
    socket.on('move', (moveData) => {
        const game = games.get(socket.gameId);
        
        if (!game) {
            socket.emit('error', { message: 'Inget aktivt spel' });
            return;
        }
        
        if (game.status !== 'playing') {
            socket.emit('error', { message: 'Spelet har inte startat' });
            return;
        }
        
        // Verify turn (for turn-based games)
        if (game.config.turnBased) {
            const currentPlayer = getCurrentPlayer(game);
            if (socket.role !== currentPlayer) {
                socket.emit('error', { message: 'Inte din tur' });
                return;
            }
        }
        
        // Store move with metadata
        game.moves.push({
            ...moveData,
            player: socket.role,
            socketId: socket.id,
            timestamp: Date.now(),
            moveNumber: game.moves.length + 1
        });
        
        // Advance turn
        const nextPlayer = advanceTurn(game);
        
        // Send to all players in game
        socket.to(game.id).emit('opponent-move', {
            ...moveData,
            player: socket.role,
            nextPlayer: nextPlayer,
            currentPlayer: nextPlayer // Bakåtkompatibilitet
        });
        
        socket.emit('move-confirmed', {
            ...moveData,
            nextPlayer: nextPlayer,
            currentPlayer: nextPlayer
        });
        
        console.log(`Move in ${game.type} game ${game.id} by ${socket.role}`);
    });
    
    // ---------- Game over ----------
    socket.on('game-over', (result) => {
        const game = games.get(socket.gameId);
        
        if (game) {
            game.status = 'finished';
            game.result = result;
            
            socket.to(game.id).emit('game-over', result);
            
            console.log(`Game ${game.id} finished:`, result);
        }
    });
    
    // ---------- Resign ----------
    socket.on('resign', () => {
        const game = games.get(socket.gameId);
        
        if (game && game.status === 'playing') {
            game.status = 'finished';
            
            // Determine winner(s) - everyone except the one who resigned
            const winners = Object.entries(game.players)
                .filter(([id, _]) => id !== socket.id)
                .map(([_, p]) => p.role);
            
            game.result = {
                winners: winners,
                loser: socket.role,
                reason: 'resignation'
            };
            
            socket.to(game.id).emit('player-resigned', {
                resignedPlayer: socket.role,
                winners: winners
            });
            
            // Bakåtkompatibilitet
            socket.to(game.id).emit('opponent-resigned');
            
            console.log(`Player ${socket.role} resigned from game ${game.id}`);
        }
    });
    
    // ---------- Draw handling ----------
    socket.on('offer-draw', () => {
        const game = games.get(socket.gameId);
        if (game && game.status === 'playing') {
            socket.to(game.id).emit('draw-offered', {
                fromPlayer: socket.role
            });
        }
    });
    
    socket.on('accept-draw', () => {
        const game = games.get(socket.gameId);
        
        if (game && game.status === 'playing') {
            game.status = 'finished';
            game.result = { winners: [], reason: 'draw' };
            
            io.to(game.id).emit('game-over', {
                winners: [],
                winner: null, // Bakåtkompatibilitet
                reason: 'Remi genom överenskommelse'
            });
            
            console.log(`Game ${game.id} ended in draw by agreement`);
        }
    });
    
    socket.on('decline-draw', () => {
        socket.to(socket.gameId).emit('draw-declined', {
            declinedBy: socket.role
        });
    });
    
    // ---------- Rematch ----------
    socket.on('request-rematch', () => {
        const game = games.get(socket.gameId);
        
        if (!game) {
            socket.emit('error', { message: 'Inget aktivt spel' });
            return;
        }
        
        game.rematchRequests.add(socket.id);
        
        const totalPlayers = Object.keys(game.players).length;
        const requestCount = game.rematchRequests.size;
        
        console.log(`Rematch requested by ${socket.role} in game ${socket.gameId} (${requestCount}/${totalPlayers})`);
        
        if (requestCount >= totalPlayers) {
            // Everyone wants rematch - rotate roles
            const roles = game.config.roles;
            
            // Rotate roles
            game.playerOrder.forEach((socketId, index) => {
                const newRoleIndex = (index + 1) % roles.length;
                game.players[socketId].role = roles[newRoleIndex];
                
                // Update socket
                const playerSocket = io.sockets.sockets.get(socketId);
                if (playerSocket) {
                    playerSocket.role = roles[newRoleIndex];
                }
            });
            
            // Reset game state
            game.moves = [];
            game.currentPlayerIndex = 0;
            game.status = 'playing';
            game.rematchRequests.clear();
            
            // Notify all players
            game.playerOrder.forEach(socketId => {
                const playerSocket = io.sockets.sockets.get(socketId);
                if (playerSocket) {
                    const newRole = game.players[socketId].role;
                    playerSocket.emit('rematch-started', {
                        role: newRole,
                        color: newRole, // Bakåtkompatibilitet
                        currentPlayer: getCurrentPlayer(game),
                        message: `Ny match! Du spelar som ${newRole}`
                    });
                }
            });
            
            console.log(`Rematch started for game ${game.id}`);
        } else {
            // Still waiting for others
            socket.emit('rematch-waiting', {
                accepted: requestCount,
                needed: totalPlayers,
                message: 'Väntar på motståndaren...'
            });
            
            socket.to(game.id).emit('rematch-requested', {
                fromPlayer: socket.role,
                accepted: requestCount,
                needed: totalPlayers,
                message: 'Motståndaren vill spela igen'
            });
        }
    });
    
    socket.on('decline-rematch', () => {
        const game = games.get(socket.gameId);
        
        if (game) {
            game.rematchRequests.clear();
            socket.to(game.id).emit('rematch-declined', {
                declinedBy: socket.role,
                message: 'Motståndaren vill inte spela igen'
            });
        }
    });
    
    // ---------- Chat (optional, works for all games) ----------
    socket.on('chat-message', ({ message }) => {
        if (socket.gameId && message && message.trim()) {
            socket.to(socket.gameId).emit('chat-message', {
                from: socket.role,
                message: message.trim(),
                timestamp: Date.now()
            });
        }
    });
    
    // ---------- Disconnect ----------
    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        
        onlineCount--;
        
        // Remove from matchmaking
        removeFromMatchmaking(socket);
        
        // Handle game disconnect
        if (socket.gameId) {
            const game = games.get(socket.gameId);
            
            if (game) {
                const disconnectedRole = socket.role;
                const playersRemaining = Object.keys(game.players).length - 1;
                
                if (game.status === 'playing') {
                    socket.to(game.id).emit('player-disconnected', {
                        disconnectedPlayer: disconnectedRole,
                        playersRemaining: playersRemaining
                    });
                    
                    // Bakåtkompatibilitet
                    socket.to(game.id).emit('opponent-disconnected');
                }
                
                // Remove player from game
                delete game.players[socket.id];
                game.playerOrder = game.playerOrder.filter(id => id !== socket.id);
                
                // End game if not enough players
                if (Object.keys(game.players).length < game.config.minPlayers) {
                    game.status = 'finished';
                    game.result = {
                        reason: 'player_disconnected',
                        disconnectedPlayer: disconnectedRole
                    };
                }
            }
            
            // Clean up old finished games after 1 hour
            setTimeout(() => {
                const g = games.get(socket.gameId);
                if (g && g.status === 'finished') {
                    games.delete(socket.gameId);
                    console.log(`Cleaned up finished game: ${socket.gameId}`);
                }
            }, 3600000);
        }
        
        io.emit('online-stats', getOnlineStats());
        io.emit('online-count', onlineCount); // Bakåtkompatibilitet
    });
});

// ==================== CLEANUP INTERVAL ====================

// Clean up stale games every 30 minutes
setInterval(() => {
    const now = Date.now();
    const staleThreshold = 2 * 60 * 60 * 1000; // 2 hours
    
    let cleanedCount = 0;
    games.forEach((game, gameId) => {
        if (now - game.createdAt > staleThreshold && game.status !== 'playing') {
            games.delete(gameId);
            cleanedCount++;
        }
    });
    
    if (cleanedCount > 0) {
        console.log(`Cleaned up ${cleanedCount} stale games`);
    }
}, 30 * 60 * 1000);

// ==================== API ENDPOINTS (optional) ====================

// Get server status
app.get('/api/status', (req, res) => {
    res.json({
        online: true,
        players: onlineCount,
        games: games.size,
        stats: getOnlineStats()
    });
});

// Get available game types
app.get('/api/games', (req, res) => {
    const gameTypes = Object.entries(GAME_CONFIGS).map(([key, config]) => ({
        id: key,
        name: config.name,
        minPlayers: config.minPlayers,
        maxPlayers: config.maxPlayers
    }));
    res.json(gameTypes);
});

// ==================== START SERVER ====================

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Game Server running on port ${PORT}`);
    console.log(`Available games: ${Object.keys(GAME_CONFIGS).join(', ')}`);
    console.log(`Endpoints:`);
    console.log(`   - http://localhost:${PORT}/ (Lobby)`);
    console.log(`   - http://localhost:${PORT}/chess (Schack)`);
    console.log(`   - http://localhost:${PORT}/tictactoe (3-i-rad)`);
    console.log(`   - http://localhost:${PORT}/api/status (Server status)`);
    console.log(`   - http://localhost:${PORT}/api/games (Game types)`);
});