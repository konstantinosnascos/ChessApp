// ==================== GAME STATE ====================

const cells = document.querySelectorAll('.cell');
const statusText = document.getElementById('status');
const resetBtn = document.getElementById('reset-btn');

let board = ['', '', '', '', '', '', '', '', ''];
let currentPlayer = 'X';
let gameActive = true;
let gameOver = false;

// Multiplayer state
let socket = null;
let isMultiplayer = false;
let myRole = null;
let gameId = null;
let isMyTurn = false;
let isSearching = false;
let waitingForRematch = false;

const winConditions = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6]
];

// ==================== DOM ELEMENTS ====================

const multiplayerMenu = document.getElementById('multiplayer-menu');
const gameCodeDisplay = document.getElementById('game-code-display');
const gameCodeElement = document.getElementById('game-code');
const createGameBtn = document.getElementById('create-game-btn');
const joinGameBtn = document.getElementById('join-game-btn');
const gameCodeInput = document.getElementById('game-code-input');
const localGameBtn = document.getElementById('local-game-btn');
const copyCodeBtn = document.getElementById('copy-code-btn');
const findGameBtn = document.getElementById('find-game-btn');
const queueStatus = document.getElementById('queue-status');
const playersOnline = document.querySelector('#players-online span');
const resignBtn = document.getElementById('resign-btn');
const multiplayerControls = document.getElementById('multiplayer-controls');
const gameOverMenu = document.getElementById('game-over-menu');
const gameOverMessage = document.getElementById('game-over-message');
const rematchBtn = document.getElementById('rematch-btn');
const newGameBtn = document.getElementById('new-game-btn');

// ==================== GAME LOGIC ====================

function handleCellClick(e) {
    const cell = e.target;
    const index = parseInt(cell.getAttribute('data-index'));
    
    if (board[index] !== '' || !gameActive) {
        return;
    }
    
    // Multiplayer checks
    if (isMultiplayer) {
        if (!isMyTurn) {
            return;
        }
        if (currentPlayer !== myRole) {
            return;
        }
    }
    
    // Make move locally
    makeMove(index);
    
    // Send to server if multiplayer
    if (isMultiplayer && socket && socket.connected) {
        socket.emit('move', { index });
    }
}

function makeMove(index) {
    board[index] = currentPlayer;
    
    const cell = document.querySelector(`.cell[data-index="${index}"]`);
    cell.textContent = currentPlayer;
    cell.classList.add(currentPlayer.toLowerCase());
    cell.disabled = true;
    
    checkWinner();
}

function checkWinner() {
    let roundWon = false;
    let winningCondition = null;
    
    for (let i = 0; i < winConditions.length; i++) {
        const condition = winConditions[i];
        const a = board[condition[0]];
        const b = board[condition[1]];
        const c = board[condition[2]];
        
        if (a === '' || b === '' || c === '') {
            continue;
        }
        
        if (a === b && b === c) {
            roundWon = true;
            winningCondition = condition;
            break;
        }
    }
    
    if (roundWon) {
        const winner = currentPlayer;
        let message;
        
        if (isMultiplayer) {
            message = winner === myRole ? 'Du vann!' : 'Du förlorade!';
        } else {
            message = `Spelare ${winner} vinner!`;
        }
        
        statusText.textContent = message;
        gameActive = false;
        gameOver = true;
        
        // Highlight winning cells
        if (winningCondition) {
            winningCondition.forEach(index => {
                document.querySelector(`.cell[data-index="${index}"]`).classList.add('winning');
            });
        }
        
        // Disable all cells
        cells.forEach(cell => cell.disabled = true);
        
        // Show game over menu in multiplayer
        if (isMultiplayer) {
            showGameOverMenu(message);
            
            // Notify server
            socket.emit('game-over', {
                winner: winner,
                reason: 'win'
            });
        }
        
        return;
    }
    
    // Check for draw
    if (!board.includes('')) {
        const message = 'Oavgjort!';
        statusText.textContent = message;
        gameActive = false;
        gameOver = true;
        
        if (isMultiplayer) {
            showGameOverMenu(message);
            socket.emit('game-over', {
                winner: null,
                reason: 'draw'
            });
        }
        
        return;
    }
    
    // Continue game - switch player
    changePlayer();
}

function changePlayer() {
    currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
    
    if (isMultiplayer) {
        isMyTurn = currentPlayer === myRole;
        updateMultiplayerStatus();
    } else {
        statusText.textContent = `Spelare ${currentPlayer}:s tur`;
    }
    
    updateStatusClass();
}

function updateStatusClass() {
    statusText.classList.remove('x-turn', 'o-turn');
    statusText.classList.add(currentPlayer === 'X' ? 'x-turn' : 'o-turn');
}

function resetGame() {
    board = ['', '', '', '', '', '', '', '', ''];
    currentPlayer = 'X';
    gameActive = true;
    gameOver = false;
    
    if (isMultiplayer) {
        isMyTurn = myRole === 'X';
        updateMultiplayerStatus();
    } else {
        statusText.textContent = `Spelare ${currentPlayer}:s tur`;
    }
    
    updateStatusClass();
    
    cells.forEach(cell => {
        cell.textContent = '';
        cell.disabled = false;
        cell.classList.remove('x', 'o', 'winning');
    });
    
    // Disable cells if not my turn in multiplayer
    if (isMultiplayer && !isMyTurn) {
        cells.forEach(cell => cell.disabled = true);
    }
}

function updateMultiplayerStatus() {
    if (!isMultiplayer) return;
    if (gameOver) return;
    
    const turnText = isMyTurn ? 'Din tur' : 'Motståndarens tur';
    const roleText = myRole === 'X' ? '(X)' : '(O)';
    
    statusText.textContent = `${turnText} ${roleText}`;
    
    // Enable/disable cells based on turn
    cells.forEach((cell, index) => {
        if (board[index] === '' && isMyTurn && gameActive) {
            cell.disabled = false;
        } else if (board[index] === '') {
            cell.disabled = !isMyTurn;
        }
    });
}

// ==================== MULTIPLAYER ====================

function connectToServer() {
    const serverUrl = window.location.hostname === 'localhost' 
        ? 'http://localhost:3000' 
        : window.location.origin;
    
    socket = io(serverUrl);
    
    socket.on('connect', () => {
        console.log('Connected to server');
        showMultiplayerMenu();
    });
    
    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        showMessage('Anslutningen till servern bröts');
    });
    
    socket.on('error', (data) => {
        showMessage(data.message);
    });
    
    socket.on('online-stats', (stats) => {
        if (playersOnline) {
            playersOnline.textContent = stats.totalOnline;
        }
    });
    
    socket.on('online-count', (count) => {
        if (playersOnline) {
            playersOnline.textContent = count;
        }
    });
    
    // Game created
    socket.on('game-created', (data) => {
        gameId = data.gameId;
        myRole = data.role;
        isMultiplayer = true;
        isMyTurn = myRole === 'X';
        gameOver = false;
        
        hideMultiplayerMenu();
        hideGameOverMenu();
        showGameCode(gameId);
        showMessage(`Spel skapat! Kod: ${gameId}\nDela koden med din motståndare.`);
        
        resetGame();
        updateMultiplayerStatus();
    });
    
    // Game joined
    socket.on('game-joined', (data) => {
        gameId = data.gameId;
        myRole = data.role;
        isMultiplayer = true;
        isMyTurn = myRole === data.currentPlayer;
        gameOver = false;
        
        hideMultiplayerMenu();
        hideGameOverMenu();
        showMessage('Ansluten! Spelet börjar.');
        
        resetGame();
        
        // Replay any existing moves
        if (data.moves && data.moves.length > 0) {
            replayMoves(data.moves);
        }
        
        updateMultiplayerStatus();
    });
    
    // Player joined your game
    socket.on('player-joined', (data) => {
        showMessage(`Spelare ${data.role} anslöt!`);
        if (data.gameStarted) {
            isMyTurn = myRole === data.currentPlayer;
            updateMultiplayerStatus();
        }
    });
    
    // Game found through matchmaking
    socket.on('game-found', (data) => {
        gameId = data.gameId;
        myRole = data.role;
        isMultiplayer = true;
        isMyTurn = myRole === data.currentPlayer;
        gameOver = false;
        isSearching = false;
        
        findGameBtn.textContent = 'Hitta motståndare';
        findGameBtn.classList.remove('searching');
        queueStatus.style.display = 'none';
        
        hideMultiplayerMenu();
        hideGameOverMenu();
        showMessage(data.message);
        
        resetGame();
        updateMultiplayerStatus();
    });
    
    // Waiting for opponent (matchmaking)
    socket.on('waiting-for-opponent', (data) => {
        isSearching = true;
        findGameBtn.textContent = 'Avbryt sökning';
        findGameBtn.classList.add('searching');
        queueStatus.style.display = 'block';
        queueStatus.textContent = data.message;
    });
    
    socket.on('matchmaking-started', (data) => {
        isSearching = true;
        findGameBtn.textContent = 'Avbryt sökning';
        findGameBtn.classList.add('searching');
        queueStatus.style.display = 'block';
        queueStatus.textContent = `Söker motståndare... (${data.queuePosition} i kö)`;
    });
    
    socket.on('search-cancelled', () => {
        isSearching = false;
        findGameBtn.textContent = 'Hitta motståndare';
        findGameBtn.classList.remove('searching');
        queueStatus.style.display = 'none';
    });
    
    // Opponent move
    socket.on('opponent-move', (moveData) => {
        // Apply opponent's move
        const index = moveData.index;
        if (index !== undefined && board[index] === '') {
            makeMove(index);
        }
        
        isMyTurn = true;
        updateMultiplayerStatus();
    });
    
    // Move confirmed
    socket.on('move-confirmed', (moveData) => {
        isMyTurn = false;
        updateMultiplayerStatus();
    });
    
    // Player disconnected
    socket.on('player-disconnected', (data) => {
        showMessage(`Spelare ${data.disconnectedPlayer} kopplade ifrån`);
        gameOver = true;
        gameActive = false;
        showGameOverMenu('Motståndaren kopplade ifrån');
    });
    
    socket.on('opponent-disconnected', () => {
        showMessage('Motståndaren kopplade ifrån');
        gameOver = true;
        gameActive = false;
        showGameOverMenu('Motståndaren kopplade ifrån');
    });
    
    // Player resigned
    socket.on('player-resigned', (data) => {
        showMessage('Motståndaren gav upp! Du vann!');
        gameOver = true;
        gameActive = false;
        showGameOverMenu('Du vann! Motståndaren gav upp.');
    });
    
    socket.on('opponent-resigned', () => {
        showMessage('Motståndaren gav upp! Du vann!');
        gameOver = true;
        gameActive = false;
        showGameOverMenu('Du vann! Motståndaren gav upp.');
    });
    
    // Game over from server
    socket.on('game-over', (result) => {
        gameOver = true;
        gameActive = false;
        
        let message;
        if (result.winners && result.winners.length > 0) {
            message = result.winners.includes(myRole) ? 'Du vann!' : 'Du förlorade!';
        } else if (result.winner) {
            message = result.winner === myRole ? 'Du vann!' : 'Du förlorade!';
        } else {
            message = 'Oavgjort!';
        }
        
        showGameOverMenu(message);
    });
    
    // Rematch
    socket.on('rematch-requested', (data) => {
        showGameOverMenu(data.message || 'Motståndaren vill spela igen');
    });
    
    socket.on('rematch-waiting', (data) => {
        waitingForRematch = true;
        gameOverMessage.textContent = `Väntar på motståndaren... (${data.accepted}/${data.needed})`;
        gameOverMessage.classList.add('waiting-rematch');
        rematchBtn.disabled = true;
        rematchBtn.textContent = 'Väntar...';
    });
    
    socket.on('rematch-started', (data) => {
        myRole = data.role;
        isMyTurn = myRole === data.currentPlayer;
        waitingForRematch = false;
        gameOver = false;
        
        hideGameOverMenu();
        resetGame();
        
        showMessage(data.message);
        updateMultiplayerStatus();
    });
    
    socket.on('rematch-declined', (data) => {
        waitingForRematch = false;
        showMessage(data.message || 'Motståndaren vill inte spela igen');
        resetRematchButton();
    });
}

function replayMoves(moves) {
    moves.forEach(move => {
        if (move.index !== undefined) {
            board[move.index] = move.player;
            const cell = document.querySelector(`.cell[data-index="${move.index}"]`);
            cell.textContent = move.player;
            cell.classList.add(move.player.toLowerCase());
            cell.disabled = true;
        }
    });
    
    // Set current player based on move count
    currentPlayer = moves.length % 2 === 0 ? 'X' : 'O';
    isMyTurn = currentPlayer === myRole;
    updateStatusClass();
}

// ==================== UI FUNCTIONS ====================

function showMultiplayerMenu() {
    multiplayerMenu.style.display = 'block';
    gameCodeDisplay.style.display = 'none';
    multiplayerControls.style.display = 'none';
    
    // Hide the board when showing menu
    document.querySelector('.board').style.display = 'none';
    document.querySelector('.controls').style.display = 'none';
}

function hideMultiplayerMenu() {
    multiplayerMenu.style.display = 'none';
    multiplayerControls.style.display = isMultiplayer ? 'flex' : 'none';
    
    // Show the board
    document.querySelector('.board').style.display = 'grid';
    document.querySelector('.controls').style.display = isMultiplayer ? 'none' : 'flex';
}

function showGameCode(code) {
    gameCodeDisplay.style.display = 'block';
    gameCodeElement.textContent = code;
}

function hideGameCode() {
    gameCodeDisplay.style.display = 'none';
}

function showGameOverMenu(message) {
    gameOverMenu.style.display = 'block';
    gameOverMessage.textContent = message;
    resetRematchButton();
}

function hideGameOverMenu() {
    gameOverMenu.style.display = 'none';
    resetRematchButton();
}

function resetRematchButton() {
    rematchBtn.disabled = false;
    rematchBtn.textContent = 'Ny match (byt sida)';
    gameOverMessage.classList.remove('waiting-rematch');
}

function showMessage(message) {
    alert(message);
}

function createGame() {
    if (socket && socket.connected) {
        socket.emit('create-game', { gameType: 'tictactoe' });
    }
}

function joinGame(code) {
    if (socket && socket.connected) {
        socket.emit('join-game', { gameId: code });
    }
}

function resignGame() {
    if (isMultiplayer && socket && confirm('Är du säker på att du vill ge upp?')) {
        socket.emit('resign');
        showMessage('Du gav upp');
        gameOver = true;
        gameActive = false;
    }
}

function requestRematch() {
    if (isMultiplayer && socket && socket.connected) {
        socket.emit('request-rematch');
    }
}

function returnToMenu() {
    if (socket && socket.connected) {
        socket.disconnect();
        socket.connect();
    }
    
    isMultiplayer = false;
    myRole = null;
    gameId = null;
    gameOver = false;
    waitingForRematch = false;
    
    hideGameOverMenu();
    hideGameCode();
    showMultiplayerMenu();
    
    resetGame();
}

// ==================== EVENT LISTENERS ====================

cells.forEach(cell => {
    cell.addEventListener('click', handleCellClick);
});

resetBtn.addEventListener('click', () => {
    if (!isMultiplayer) {
        resetGame();
    }
});

createGameBtn.addEventListener('click', createGame);

joinGameBtn.addEventListener('click', () => {
    const code = gameCodeInput.value.trim().toUpperCase();
    if (code.length > 0) {
        joinGame(code);
    } else {
        showMessage('Ange en spelkod');
    }
});

gameCodeInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        joinGameBtn.click();
    }
});

localGameBtn.addEventListener('click', () => {
    isMultiplayer = false;
    myRole = null;
    gameId = null;
    
    hideMultiplayerMenu();
    hideGameCode();
    multiplayerControls.style.display = 'none';
    document.querySelector('.controls').style.display = 'flex';
    
    resetGame();
});

copyCodeBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(gameCodeElement.textContent).then(() => {
        showMessage('Kod kopierad!');
    });
});

findGameBtn.addEventListener('click', () => {
    if (!socket || !socket.connected) {
        showMessage('Inte ansluten till servern');
        return;
    }
    
    if (isSearching) {
        socket.emit('cancel-search');
    } else {
        socket.emit('find-game', { gameType: 'tictactoe' });
    }
});

resignBtn.addEventListener('click', resignGame);
rematchBtn.addEventListener('click', requestRematch);
newGameBtn.addEventListener('click', returnToMenu);

// ==================== INITIALIZE ====================

console.log('Connecting to server...');
connectToServer();