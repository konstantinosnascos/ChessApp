// server.js
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

// Serve static files
app.use(express.static('public'));

// Store active games
const games = new Map();

// Generate random game ID
function generateGameId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);
    
    // Create new game
    socket.on('create-game', () => {
        const gameId = generateGameId();
        
        games.set(gameId, {
            id: gameId,
            white: socket.id,
            black: null,
            moves: [],
            currentPlayer: 'white',
            status: 'waiting',
            rematchRequests: {}
        });
        
        socket.join(gameId);
        socket.gameId = gameId;
        socket.color = 'white';
        
        socket.emit('game-created', { 
            gameId, 
            color: 'white',
            message: 'Väntar på motståndare...'
        });
        
        console.log(`Game ${gameId} created by ${socket.id}`);
    });
    
    // Join existing game
    socket.on('join-game', (gameId) => {
        const game = games.get(gameId.toUpperCase());
        
        if (!game) {
            socket.emit('error', { message: 'Spelet finns inte' });
            return;
        }
        
        if (game.black !== null) {
            socket.emit('error', { message: 'Spelet är fullt' });
            return;
        }
        
        game.black = socket.id;
        game.status = 'playing';
        
        socket.join(gameId.toUpperCase());
        socket.gameId = gameId.toUpperCase();
        socket.color = 'black';
        
        socket.emit('game-joined', { 
            gameId: game.id, 
            color: 'black',
            moves: game.moves
        });
        
        // Notify white player that game started
        io.to(game.white).emit('opponent-joined', {
            message: 'Motståndare ansluten! Spelet börjar.'
        });
        
        console.log(`Player ${socket.id} joined game ${gameId}`);
    });
    
    // Handle move
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
        
        // Verify it's this player's turn
        if (game.currentPlayer !== socket.color) {
            socket.emit('error', { message: 'Inte din tur' });
            return;
        }
        
        // Store move
        game.moves.push({
            ...moveData,
            player: socket.color,
            timestamp: Date.now()
        });
        
        // Switch turn
        game.currentPlayer = game.currentPlayer === 'white' ? 'black' : 'white';
        
        // Send move to opponent
        socket.to(socket.gameId).emit('opponent-move', moveData);
        
        // Confirm move to sender
        socket.emit('move-confirmed', moveData);
        
        console.log(`Move in game ${socket.gameId}:`, moveData);
    });
    
    // Handle game over
    socket.on('game-over', (result) => {
        const game = games.get(socket.gameId);
        
        if (game) {
            game.status = 'finished';
            game.result = result;
            
            socket.to(socket.gameId).emit('game-over', result);
        }
    });
    
    // Handle resignation
    socket.on('resign', () => {
        const game = games.get(socket.gameId);
        
        if (game && game.status === 'playing') {
            game.status = 'finished';
            game.result = {
                winner: socket.color === 'white' ? 'black' : 'white',
                reason: 'resignation'
            };
            
            socket.to(socket.gameId).emit('opponent-resigned');
        }
    });
    
    // Handle draw offer
    socket.on('offer-draw', () => {
        socket.to(socket.gameId).emit('draw-offered');
    });
    
    socket.on('accept-draw', () => {
        const game = games.get(socket.gameId);
        
        if (game) {
            game.status = 'finished';
            game.result = { winner: null, reason: 'draw' };
            
            io.to(socket.gameId).emit('game-over', { 
                winner: null, 
                reason: 'Remi genom överenskommelse' 
            });
        }
    });
    
    socket.on('decline-draw', () => {
        socket.to(socket.gameId).emit('draw-declined');
    });
    
    // ==================== REMATCH HANDLERS (INSIDE connection block!) ====================
    
    // Handle rematch request
    socket.on('request-rematch', () => {
        const game = games.get(socket.gameId);
        
        if (!game) {
            socket.emit('error', { message: 'Inget aktivt spel' });
            return;
        }
        
        // Mark that this player wants rematch
        if (!game.rematchRequests) {
            game.rematchRequests = {};
        }
        game.rematchRequests[socket.color] = true;
        
        console.log(`Rematch requested by ${socket.color} in game ${socket.gameId}`);
        
        // Check if both players want rematch
        if (game.rematchRequests.white && game.rematchRequests.black) {
            // Both want rematch - start new game with swapped colors
            const oldWhite = game.white;
            const oldBlack = game.black;
            
            // Swap colors
            game.white = oldBlack;
            game.black = oldWhite;
            
            // Update socket colors
            io.sockets.sockets.forEach((s) => {
                if (s.gameId === socket.gameId) {
                    if (s.id === oldWhite) {
                        s.color = 'black';
                    } else if (s.id === oldBlack) {
                        s.color = 'white';
                    }
                }
            });
            
            // Reset game state
            game.moves = [];
            game.currentPlayer = 'white';
            game.status = 'playing';
            game.rematchRequests = {};
            
            // Notify both players
            io.to(oldWhite).emit('rematch-started', { 
                color: 'black',
                message: 'Ny match! Du spelar nu som svart.'
            });
            
            io.to(oldBlack).emit('rematch-started', { 
                color: 'white',
                message: 'Ny match! Du spelar nu som vit.'
            });
            
            console.log(`Rematch started in game ${socket.gameId}`);
        } else {
            // Notify opponent about rematch request
            socket.to(socket.gameId).emit('rematch-requested', {
                message: 'Motståndaren vill spela igen'
            });
            
            socket.emit('rematch-waiting', {
                message: 'Väntar på motståndaren...'
            });
        }
    });
    
    // Handle rematch decline
    socket.on('decline-rematch', () => {
        const game = games.get(socket.gameId);
        
        if (game) {
            game.rematchRequests = {};
            socket.to(socket.gameId).emit('rematch-declined', {
                message: 'Motståndaren vill inte spela igen'
            });
        }
    });
    
    // ==================== END REMATCH HANDLERS ====================
    
    // Handle disconnect
    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        
        if (socket.gameId) {
            const game = games.get(socket.gameId);
            
            if (game && game.status === 'playing') {
                socket.to(socket.gameId).emit('opponent-disconnected');
            }
            
            // Clean up old games after 1 hour
            setTimeout(() => {
                if (games.has(socket.gameId)) {
                    const g = games.get(socket.gameId);
                    if (g.status !== 'playing') {
                        games.delete(socket.gameId);
                    }
                }
            }, 3600000);
        }
    });
    
}); // ← This closes io.on('connection', ...)

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});