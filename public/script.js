// Chess pieces Unicode
const PIECES = {
    white: {
        king: '♔',
        queen: '♕',
        rook: '♖',
        bishop: '♗',
        knight: '♘',
        pawn: '♙'
    },
    black: {
        king: '♚',
        queen: '♛',
        rook: '♜',
        bishop: '♝',
        knight: '♞',
        pawn: '♟'
    }
};

// Initial board setup
const INITIAL_BOARD = [
    ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
    ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
    ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
];

// Game state
let board = [];
let currentPlayer = 'white';
let selectedSquare = null;
let validMoves = [];
let moveHistory = [];
let capturedPieces = { white: [], black: [] };
let lastMove = null;
let waitingForRematch = false;
let boardFlipped = false;
let gameOver = false;

// Multiplayer state
let socket = null;
let isMultiplayer = false;
let myColor = null;
let gameId = null;
let isMyTurn = false;

// Castling rights tracking
let castlingRights = {
    white: { kingSide: true, queenSide: true },
    black: { kingSide: true, queenSide: true }
};

// En passant target square
let enPassantTarget = null;

// Promotion state
let pendingPromotion = null;

// Drag and drop state
let isDragging = false;
let draggedPiece = null;
let draggedFrom = null;
let dragGhost = null;
let dragValidMoves = [];

// DOM elements
const boardElement = document.querySelector('.board');
const statusElement = document.getElementById('status');
const resetBtn = document.getElementById('reset-btn');
const undoBtn = document.getElementById('undo-btn');
const capturedWhiteElement = document.querySelector('#captured-white span');
const capturedBlackElement = document.querySelector('#captured-black span');
const promotionModal = document.getElementById('promotion-modal');
const promotionButtons = document.querySelectorAll('.promotion-btn');
const flipBtn = document.getElementById('flip-btn');
const gameOverMenu = document.getElementById('game-over-menu');
const gameOverMessage = document.getElementById('game-over-message');
const rematchBtn = document.getElementById('rematch-btn');
const newGameBtn = document.getElementById('new-game-btn');

// Initialize the game
function initGame() {
    board = INITIAL_BOARD.map(row => [...row]);
    currentPlayer = 'white';
    selectedSquare = null;
    validMoves = [];
    moveHistory = [];
    capturedPieces = { white: [], black: [] };
    lastMove = null;
    pendingPromotion = null;
    gameOver = false;
    
    // Reset drag state
    isDragging = false;
    draggedPiece = null;
    draggedFrom = null;
    dragValidMoves = [];
    removeDragGhost();
    
    // Reset castling rights
    castlingRights = {
        white: { kingSide: true, queenSide: true },
        black: { kingSide: true, queenSide: true }
    };
    
    // Reset en passant
    enPassantTarget = null;
    
    // Hide promotion modal
    hidePromotionModal();
    
    renderBoard();
    updateRowColLabels();
    updateStatus();
    updateCapturedPieces();
}

// Render the chess board
function renderBoard() {
    boardElement.innerHTML = '';
    boardElement.classList.toggle('is-dragging', isDragging);
    
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const square = document.createElement('button');
            const isLight = (row + col) % 2 === 0;
            
            square.className = `square ${isLight ? 'light' : 'dark'}`;
            square.setAttribute('data-row', row);
            square.setAttribute('data-col', col);
            square.setAttribute('aria-label', getSquareLabel(row, col));
            
            // Disable board interaction during promotion
            if (pendingPromotion) {
                square.disabled = true;
            }
            
            const piece = board[row][col];
            if (piece) {
                const pieceSpan = document.createElement('span');
                pieceSpan.className = `piece ${getPieceColor(piece)}`;
                pieceSpan.textContent = getPieceSymbol(piece);
                
                // Make piece draggable if it's the current player's piece
                if (getPieceColor(piece) === currentPlayer && !pendingPromotion) {
                    pieceSpan.draggable = true;
                    pieceSpan.setAttribute('data-row', row);
                    pieceSpan.setAttribute('data-col', col);
                }
                
                square.appendChild(pieceSpan);
            }
            
            // Highlight last move
            if (lastMove) {
                if ((row === lastMove.fromRow && col === lastMove.fromCol) ||
                    (row === lastMove.toRow && col === lastMove.toCol)) {
                    square.classList.add('last-move');
                }
                if (lastMove.castling) {
                    if ((row === lastMove.rookFromRow && col === lastMove.rookFromCol) ||
                        (row === lastMove.rookToRow && col === lastMove.rookToCol)) {
                        square.classList.add('last-move');
                    }
                }
                if (lastMove.enPassant) {
                    if (row === lastMove.capturedPawnRow && col === lastMove.capturedPawnCol) {
                        square.classList.add('last-move');
                    }
                }
            }
            
            // Highlight selected square (for click-to-move)
            if (selectedSquare && selectedSquare.row === row && selectedSquare.col === col) {
                square.classList.add('selected');
            }
            
            // Highlight valid moves (for click-to-move)
            const validMove = validMoves.find(move => move.row === row && move.col === col);
            if (validMove) {
                if (board[row][col] || validMove.enPassant) {
                    square.classList.add('valid-capture');
                } else {
                    square.classList.add('valid-move');
                }
            }
            
            // Highlight valid moves during drag
            if (isDragging && dragValidMoves.length > 0) {
                const dragMove = dragValidMoves.find(move => move.row === row && move.col === col);
                if (dragMove) {
                    if (board[row][col] || dragMove.enPassant) {
                        square.classList.add('can-capture');
                    } else {
                        square.classList.add('can-move');
                    }
                }
            }
            
            // Check indicator
            if (isKingInCheck(currentPlayer)) {
                const kingPos = findKing(currentPlayer);
                if (kingPos && kingPos.row === row && kingPos.col === col) {
                    square.classList.add('in-check');
                }
            }
            
            // Event listeners for click-to-move
            square.addEventListener('click', () => handleSquareClick(row, col));
            
            // Event listeners for drag and drop
            square.addEventListener('dragover', handleDragOver);
            square.addEventListener('dragenter', handleDragEnter);
            square.addEventListener('dragleave', handleDragLeave);
            square.addEventListener('drop', handleDrop);
            
            boardElement.appendChild(square);
        }
    }
    
    // Add drag event listeners to pieces
    const pieces = boardElement.querySelectorAll('.piece[draggable="true"]');
    pieces.forEach(piece => {
        piece.addEventListener('dragstart', handleDragStart);
        piece.addEventListener('dragend', handleDragEnd);
    });
    
    // Add touch event listeners for mobile drag and drop
    addTouchListeners();
}

// ==================== DRAG AND DROP FUNCTIONS ====================

// Handle drag start
function handleDragStart(e) {
    if (pendingPromotion) {
        e.preventDefault();
        return;
    }
    
    const row = parseInt(e.target.getAttribute('data-row'));
    const col = parseInt(e.target.getAttribute('data-col'));
    const piece = board[row][col];
    
    if (!piece || getPieceColor(piece) !== currentPlayer) {
        e.preventDefault();
        return;
    }
    
    isDragging = true;
    draggedPiece = piece;
    draggedFrom = { row, col };
    dragValidMoves = getValidMoves(row, col);
    
    // Clear click-to-move selection
    selectedSquare = null;
    validMoves = [];
    
    // Create custom drag image
    createDragGhost(piece, e.clientX, e.clientY);
    
    // Hide default drag image
    const emptyImg = new Image();
    emptyImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    e.dataTransfer.setDragImage(emptyImg, 0, 0);
    
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `${row},${col}`);
    
    // Add dragging class to source square
    e.target.classList.add('dragging');
    
    // Re-render to show valid moves
    setTimeout(() => renderBoard(), 0);
}

// Handle drag over
function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    // Update ghost position
    if (dragGhost) {
        dragGhost.style.left = e.clientX + 'px';
        dragGhost.style.top = e.clientY + 'px';
    }
}

// Handle drag enter
function handleDragEnter(e) {
    e.preventDefault();
    const square = e.target.closest('.square');
    if (!square) return;
    
    const row = parseInt(square.getAttribute('data-row'));
    const col = parseInt(square.getAttribute('data-col'));
    
    // Check if this is a valid drop target
    const isValidTarget = dragValidMoves.some(move => move.row === row && move.col === col);
    
    if (isValidTarget) {
        square.classList.add('drag-over');
    }
}

// Handle drag leave
function handleDragLeave(e) {
    const square = e.target.closest('.square');
    if (square) {
        square.classList.remove('drag-over');
    }
}

// Handle drop
function handleDrop(e) {
    e.preventDefault();
    
    const square = e.target.closest('.square');
    if (!square) return;
    
    square.classList.remove('drag-over');
    
    const toRow = parseInt(square.getAttribute('data-row'));
    const toCol = parseInt(square.getAttribute('data-col'));
    
    if (draggedFrom) {
        const validMove = dragValidMoves.find(move => move.row === toRow && move.col === toCol);
        
        if (validMove) {
            makeMove(draggedFrom.row, draggedFrom.col, toRow, toCol, validMove);
        }
    }
    
    // Clean up drag state
    cleanupDrag();
}

// Handle drag end
function handleDragEnd(e) {
    cleanupDrag();
    renderBoard();
}

// Create drag ghost element
function createDragGhost(piece, x, y) {
    removeDragGhost();
    
    dragGhost = document.createElement('div');
    dragGhost.className = `drag-ghost ${getPieceColor(piece)}`;
    dragGhost.textContent = getPieceSymbol(piece);
    dragGhost.style.left = x + 'px';
    dragGhost.style.top = y + 'px';
    
    document.body.appendChild(dragGhost);
}

// Remove drag ghost element
function removeDragGhost() {
    if (dragGhost) {
        dragGhost.remove();
        dragGhost = null;
    }
}

// Clean up drag state
function cleanupDrag() {
    isDragging = false;
    draggedPiece = null;
    draggedFrom = null;
    dragValidMoves = [];
    removeDragGhost();
    
    // Remove all drag-related classes
    document.querySelectorAll('.dragging, .drag-over').forEach(el => {
        el.classList.remove('dragging', 'drag-over');
    });
}

// ==================== TOUCH SUPPORT FOR MOBILE ====================

let touchStartPos = null;
let touchPiece = null;
let touchFrom = null;
let touchValidMoves = [];

function addTouchListeners() {
    const pieces = boardElement.querySelectorAll('.piece[draggable="true"]');
    
    pieces.forEach(piece => {
        piece.addEventListener('touchstart', handleTouchStart, { passive: false });
        piece.addEventListener('touchmove', handleTouchMove, { passive: false });
        piece.addEventListener('touchend', handleTouchEnd, { passive: false });
    });
}

function handleTouchStart(e) {
    if (pendingPromotion) return;
    
    e.preventDefault();
    
    const touch = e.touches[0];
    const piece = e.target.closest('.piece');
    if (!piece) return;
    
    const row = parseInt(piece.getAttribute('data-row'));
    const col = parseInt(piece.getAttribute('data-col'));
    const boardPiece = board[row][col];
    
    if (!boardPiece || getPieceColor(boardPiece) !== currentPlayer) return;
    
    touchStartPos = { x: touch.clientX, y: touch.clientY };
    touchPiece = boardPiece;
    touchFrom = { row, col };
    touchValidMoves = getValidMoves(row, col);
    
    // Clear click selection
    selectedSquare = null;
    validMoves = [];
    
    // Create ghost
    createDragGhost(boardPiece, touch.clientX, touch.clientY);
    
    // Show valid moves
    isDragging = true;
    dragValidMoves = touchValidMoves;
    renderBoard();
}

function handleTouchMove(e) {
    if (!touchPiece) return;
    
    e.preventDefault();
    
    const touch = e.touches[0];
    
    // Update ghost position
    if (dragGhost) {
        dragGhost.style.left = touch.clientX + 'px';
        dragGhost.style.top = touch.clientY + 'px';
    }
    
    // Highlight square under finger
    const elementUnder = document.elementFromPoint(touch.clientX, touch.clientY);
    const square = elementUnder?.closest('.square');
    
    // Remove previous highlights
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    
    if (square) {
        const row = parseInt(square.getAttribute('data-row'));
        const col = parseInt(square.getAttribute('data-col'));
        const isValid = touchValidMoves.some(move => move.row === row && move.col === col);
        
        if (isValid) {
            square.classList.add('drag-over');
        }
    }
}

function handleTouchEnd(e) {
    if (!touchPiece) return;
    
    e.preventDefault();
    
    // Get final position
    const touch = e.changedTouches[0];
    const elementUnder = document.elementFromPoint(touch.clientX, touch.clientY);
    const square = elementUnder?.closest('.square');
    
    if (square && touchFrom) {
        const toRow = parseInt(square.getAttribute('data-row'));
        const toCol = parseInt(square.getAttribute('data-col'));
        
        const validMove = touchValidMoves.find(move => move.row === toRow && move.col === toCol);
        
        if (validMove) {
            makeMove(touchFrom.row, touchFrom.col, toRow, toCol, validMove);
        }
    }
    
    // Clean up
    touchStartPos = null;
    touchPiece = null;
    touchFrom = null;
    touchValidMoves = [];
    cleanupDrag();
    renderBoard();
}

// ==================== CLICK-TO-MOVE (EXISTING FUNCTIONALITY) ====================

function getSquareLabel(row, col) {
    const colLetter = String.fromCharCode(97 + col);
    const rowNumber = 8 - row;
    const piece = board[row][col];
    const pieceName = piece ? getPieceName(piece) : 'tom';
    return `${colLetter}${rowNumber}, ${pieceName}`;
}

function getPieceColor(piece) {
    return piece === piece.toUpperCase() ? 'white' : 'black';
}

function getPieceSymbol(piece) {
    const color = getPieceColor(piece);
    const type = piece.toLowerCase();
    
    const pieceMap = {
        'k': PIECES[color].king,
        'q': PIECES[color].queen,
        'r': PIECES[color].rook,
        'b': PIECES[color].bishop,
        'n': PIECES[color].knight,
        'p': PIECES[color].pawn
    };
    
    return pieceMap[type] || '';
}

function getPieceName(piece) {
    const names = {
        'k': 'kung',
        'q': 'dam',
        'r': 'torn',
        'b': 'löpare',
        'n': 'springare',
        'p': 'bonde'
    };
    const color = getPieceColor(piece) === 'white' ? 'vit' : 'svart';
    return `${color} ${names[piece.toLowerCase()]}`;
}

function handleSquareClick(row, col) {
    // Ignore clicks during drag or promotion
    if (isDragging || pendingPromotion) return;
    
    const piece = board[row][col];
    
    if (selectedSquare) {
        const validMove = validMoves.find(move => move.row === row && move.col === col);
        
        if (validMove) {
            makeMove(selectedSquare.row, selectedSquare.col, row, col, validMove);
            selectedSquare = null;
            validMoves = [];
        } else if (piece && getPieceColor(piece) === currentPlayer) {
            selectedSquare = { row, col };
            validMoves = getValidMoves(row, col);
        } else {
            selectedSquare = null;
            validMoves = [];
        }
    } else {
        if (piece && getPieceColor(piece) === currentPlayer) {
            selectedSquare = { row, col };
            validMoves = getValidMoves(row, col);
        }
    }
    
    renderBoard();
}

// ==================== MOVE VALIDATION ====================

function getValidMoves(row, col) {
    const piece = board[row][col];
    if (!piece) return [];
    
    const moves = [];
    const color = getPieceColor(piece);
    const type = piece.toLowerCase();
    
    switch (type) {
        case 'p':
            addPawnMoves(row, col, color, moves);
            break;
        case 'r':
            addLineMoves(row, col, color, moves, [[0, 1], [0, -1], [1, 0], [-1, 0]]);
            break;
        case 'n':
            addKnightMoves(row, col, color, moves);
            break;
        case 'b':
            addLineMoves(row, col, color, moves, [[1, 1], [1, -1], [-1, 1], [-1, -1]]);
            break;
        case 'q':
            addLineMoves(row, col, color, moves, [
                [0, 1], [0, -1], [1, 0], [-1, 0],
                [1, 1], [1, -1], [-1, 1], [-1, -1]
            ]);
            break;
        case 'k':
            addKingMoves(row, col, color, moves);
            addCastlingMoves(row, col, color, moves);
            break;
    }
    
    return moves.filter(move => {
        if (move.castling) return true;
        return !wouldBeInCheck(row, col, move.row, move.col, color, move.enPassant);
    });
}

function addPawnMoves(row, col, color, moves) {
    const direction = color === 'white' ? -1 : 1;
    const startRow = color === 'white' ? 6 : 1;
    const promotionRow = color === 'white' ? 0 : 7;
    
    if (isValidSquare(row + direction, col) && !board[row + direction][col]) {
        const isPromotion = (row + direction) === promotionRow;
        moves.push({ row: row + direction, col, promotion: isPromotion });
        
        if (row === startRow && !board[row + 2 * direction][col]) {
            moves.push({ row: row + 2 * direction, col, pawnDoubleMove: true });
        }
    }
    
    for (const dc of [-1, 1]) {
        const newRow = row + direction;
        const newCol = col + dc;
        if (isValidSquare(newRow, newCol)) {
            const target = board[newRow][newCol];
            if (target && getPieceColor(target) !== color) {
                const isPromotion = newRow === promotionRow;
                moves.push({ row: newRow, col: newCol, promotion: isPromotion });
            }
            
            if (enPassantTarget && enPassantTarget.row === newRow && enPassantTarget.col === newCol) {
                moves.push({ 
                    row: newRow, 
                    col: newCol, 
                    enPassant: true,
                    capturedPawnRow: row,
                    capturedPawnCol: newCol
                });
            }
        }
    }
}

function addLineMoves(row, col, color, moves, directions) {
    for (const [dr, dc] of directions) {
        let newRow = row + dr;
        let newCol = col + dc;
        
        while (isValidSquare(newRow, newCol)) {
            const target = board[newRow][newCol];
            
            if (!target) {
                moves.push({ row: newRow, col: newCol });
            } else {
                if (getPieceColor(target) !== color) {
                    moves.push({ row: newRow, col: newCol });
                }
                break;
            }
            
            newRow += dr;
            newCol += dc;
        }
    }
}

function addKnightMoves(row, col, color, moves) {
    const knightMoves = [
        [-2, -1], [-2, 1], [-1, -2], [-1, 2],
        [1, -2], [1, 2], [2, -1], [2, 1]
    ];
    
    for (const [dr, dc] of knightMoves) {
        const newRow = row + dr;
        const newCol = col + dc;
        
        if (isValidSquare(newRow, newCol)) {
            const target = board[newRow][newCol];
            if (!target || getPieceColor(target) !== color) {
                moves.push({ row: newRow, col: newCol });
            }
        }
    }
}

function addKingMoves(row, col, color, moves) {
    const kingMoves = [
        [-1, -1], [-1, 0], [-1, 1],
        [0, -1], [0, 1],
        [1, -1], [1, 0], [1, 1]
    ];
    
    for (const [dr, dc] of kingMoves) {
        const newRow = row + dr;
        const newCol = col + dc;
        
        if (isValidSquare(newRow, newCol)) {
            const target = board[newRow][newCol];
            if (!target || getPieceColor(target) !== color) {
                moves.push({ row: newRow, col: newCol });
            }
        }
    }
}

function addCastlingMoves(row, col, color, moves) {
    if (isKingInCheck(color)) return;
    
    const rights = castlingRights[color];
    const kingRow = color === 'white' ? 7 : 0;
    
    if (row !== kingRow || col !== 4) return;
    
    if (rights.kingSide) {
        if (!board[kingRow][5] && !board[kingRow][6]) {
            const rookPiece = board[kingRow][7];
            if (rookPiece && rookPiece.toLowerCase() === 'r' && getPieceColor(rookPiece) === color) {
                if (!isSquareAttacked(kingRow, 5, color) && !isSquareAttacked(kingRow, 6, color)) {
                    moves.push({ 
                        row: kingRow, 
                        col: 6, 
                        castling: 'kingSide',
                        rookFromCol: 7,
                        rookToCol: 5
                    });
                }
            }
        }
    }
    
    if (rights.queenSide) {
        if (!board[kingRow][1] && !board[kingRow][2] && !board[kingRow][3]) {
            const rookPiece = board[kingRow][0];
            if (rookPiece && rookPiece.toLowerCase() === 'r' && getPieceColor(rookPiece) === color) {
                if (!isSquareAttacked(kingRow, 2, color) && !isSquareAttacked(kingRow, 3, color)) {
                    moves.push({ 
                        row: kingRow, 
                        col: 2, 
                        castling: 'queenSide',
                        rookFromCol: 0,
                        rookToCol: 3
                    });
                }
            }
        }
    }
}

function isSquareAttacked(row, col, color) {
    const opponentColor = color === 'white' ? 'black' : 'white';
    
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = board[r][c];
            if (piece && getPieceColor(piece) === opponentColor) {
                const attacks = getAttackSquares(r, c);
                if (attacks.some(sq => sq.row === row && sq.col === col)) {
                    return true;
                }
            }
        }
    }
    
    return false;
}

function isValidSquare(row, col) {
    return row >= 0 && row < 8 && col >= 0 && col < 8;
}

function wouldBeInCheck(fromRow, fromCol, toRow, toCol, color, isEnPassant = false) {
    const tempBoard = board.map(row => [...row]);
    const piece = board[fromRow][fromCol];
    board[toRow][toCol] = piece;
    board[fromRow][fromCol] = '';
    
    if (isEnPassant) {
        board[fromRow][toCol] = '';
    }
    
    const inCheck = isKingInCheck(color);
    
    board = tempBoard;
    
    return inCheck;
}

function isKingInCheck(color) {
    const kingPos = findKing(color);
    if (!kingPos) return false;
    
    const opponentColor = color === 'white' ? 'black' : 'white';
    
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const piece = board[row][col];
            if (piece && getPieceColor(piece) === opponentColor) {
                const attacks = getAttackSquares(row, col);
                if (attacks.some(sq => sq.row === kingPos.row && sq.col === kingPos.col)) {
                    return true;
                }
            }
        }
    }
    
    return false;
}

function getAttackSquares(row, col) {
    const piece = board[row][col];
    if (!piece) return [];
    
    const moves = [];
    const color = getPieceColor(piece);
    const type = piece.toLowerCase();
    
    switch (type) {
        case 'p':
            const direction = color === 'white' ? -1 : 1;
            for (const dc of [-1, 1]) {
                const newRow = row + direction;
                const newCol = col + dc;
                if (isValidSquare(newRow, newCol)) {
                    moves.push({ row: newRow, col: newCol });
                }
            }
            break;
        case 'r':
            addLineMoves(row, col, color, moves, [[0, 1], [0, -1], [1, 0], [-1, 0]]);
            break;
        case 'n':
            addKnightMoves(row, col, color, moves);
            break;
        case 'b':
            addLineMoves(row, col, color, moves, [[1, 1], [1, -1], [-1, 1], [-1, -1]]);
            break;
        case 'q':
            addLineMoves(row, col, color, moves, [
                [0, 1], [0, -1], [1, 0], [-1, 0],
                [1, 1], [1, -1], [-1, 1], [-1, -1]
            ]);
            break;
        case 'k':
            addKingMoves(row, col, color, moves);
            break;
    }
    
    return moves;
}

function findKing(color) {
    const kingChar = color === 'white' ? 'K' : 'k';
    
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            if (board[row][col] === kingChar) {
                return { row, col };
            }
        }
    }
    
    return null;
}

// ==================== MAKE MOVE ====================

function makeMove(fromRow, fromCol, toRow, toCol, moveData = {}) {
    const piece = board[fromRow][fromCol];
    const captured = board[toRow][toCol];
    const color = getPieceColor(piece);
    
    if (moveData.promotion) {
        pendingPromotion = {
            fromRow,
            fromCol,
            toRow,
            toCol,
            piece,
            captured,
            color,
            moveData
        };
        showPromotionModal(color);
        renderBoard();
        return;
    }
    
    executeMove(fromRow, fromCol, toRow, toCol, piece, captured, color, moveData);
}

function executeMove(fromRow, fromCol, toRow, toCol, piece, captured, color, moveData, promotedPiece = null) {
    const previousCastlingRights = {
        white: { ...castlingRights.white },
        black: { ...castlingRights.black }
    };
    const previousEnPassantTarget = enPassantTarget ? { ...enPassantTarget } : null;
    
    const historyEntry = {
        fromRow,
        fromCol,
        toRow,
        toCol,
        piece,
        captured,
        previousLastMove: lastMove,
        previousCastlingRights,
        previousEnPassantTarget,
        castling: moveData.castling || null,
        enPassant: moveData.enPassant || false,
        promotion: moveData.promotion || false,
        promotedTo: promotedPiece
    };
    
    if (moveData.castling) {
        const rookFromCol = moveData.rookFromCol;
        const rookToCol = moveData.rookToCol;
        const rook = board[fromRow][rookFromCol];
        
        board[fromRow][rookToCol] = rook;
        board[fromRow][rookFromCol] = '';
        
        historyEntry.rookFromCol = rookFromCol;
        historyEntry.rookToCol = rookToCol;
        historyEntry.rook = rook;
    }
    
    let enPassantCapturedPawn = null;
    if (moveData.enPassant) {
        enPassantCapturedPawn = board[fromRow][toCol];
        board[fromRow][toCol] = '';
        
        historyEntry.enPassantCapturedPawn = enPassantCapturedPawn;
        historyEntry.enPassantCapturedRow = fromRow;
        historyEntry.enPassantCapturedCol = toCol;
        
        const capturedColor = getPieceColor(enPassantCapturedPawn);
        capturedPieces[capturedColor].push(enPassantCapturedPawn);
    }
    
    moveHistory.push(historyEntry);
    
    if (captured && !moveData.enPassant) {
        const capturedColor = getPieceColor(captured);
        capturedPieces[capturedColor].push(captured);
    }
    
    board[toRow][toCol] = piece;
    board[fromRow][fromCol] = '';
    
    updateCastlingRights(piece, fromRow, fromCol, color);
    
    if (moveData.pawnDoubleMove) {
        const passedRow = color === 'white' ? fromRow - 1 : fromRow + 1;
        enPassantTarget = { row: passedRow, col: fromCol };
    } else {
        enPassantTarget = null;
    }
    
    if (promotedPiece) {
        board[toRow][toCol] = color === 'white' ? promotedPiece.toUpperCase() : promotedPiece.toLowerCase();
    }
    
    lastMove = { 
        fromRow, 
        fromCol, 
        toRow, 
        toCol,
        castling: moveData.castling || null,
        rookFromRow: moveData.castling ? fromRow : null,
        rookFromCol: moveData.rookFromCol || null,
        rookToRow: moveData.castling ? fromRow : null,
        rookToCol: moveData.rookToCol || null,
        enPassant: moveData.enPassant || false,
        capturedPawnRow: moveData.enPassant ? fromRow : null,
        capturedPawnCol: moveData.enPassant ? toCol : null
    };
    
    currentPlayer = currentPlayer === 'white' ? 'black' : 'white';
    
    renderBoard();
    updateStatus();
    updateCapturedPieces();
    checkGameOver();
}

// ==================== PROMOTION ====================

function showPromotionModal(color) {
    promotionModal.classList.add('active');
    
    const pieceSymbols = {
        'q': color === 'white' ? PIECES.white.queen : PIECES.black.queen,
        'r': color === 'white' ? PIECES.white.rook : PIECES.black.rook,
        'b': color === 'white' ? PIECES.white.bishop : PIECES.black.bishop,
        'n': color === 'white' ? PIECES.white.knight : PIECES.black.knight
    };
    
    promotionButtons.forEach(btn => {
        const pieceType = btn.getAttribute('data-piece');
        const icon = btn.querySelector('.piece-icon');
        icon.textContent = pieceSymbols[pieceType];
        
        btn.classList.remove('white-piece', 'black-piece');
        btn.classList.add(color === 'white' ? 'white-piece' : 'black-piece');
    });
    
    promotionButtons[0].focus();
}

function hidePromotionModal() {
    promotionModal.classList.remove('active');
}

function handlePromotionChoice(pieceType) {
    if (!pendingPromotion) return;
    
    const { fromRow, fromCol, toRow, toCol, piece, captured, color, moveData } = pendingPromotion;
    
    hidePromotionModal();
    
    executeMove(fromRow, fromCol, toRow, toCol, piece, captured, color, moveData, pieceType);
    
    pendingPromotion = null;
}

// ==================== GAME STATE ====================

function updateCastlingRights(piece, fromRow, fromCol, color) {
    const type = piece.toLowerCase();
    
    if (type === 'k') {
        castlingRights[color].kingSide = false;
        castlingRights[color].queenSide = false;
    }
    
    if (type === 'r') {
        if (color === 'white' && fromRow === 7) {
            if (fromCol === 0) castlingRights.white.queenSide = false;
            if (fromCol === 7) castlingRights.white.kingSide = false;
        }
        if (color === 'black' && fromRow === 0) {
            if (fromCol === 0) castlingRights.black.queenSide = false;
            if (fromCol === 7) castlingRights.black.kingSide = false;
        }
    }
}

function undoMove() {
    if (moveHistory.length === 0) return;
    if (pendingPromotion) return;
    
    const lastMoveData = moveHistory.pop();
    
    if (lastMoveData.promotion && lastMoveData.promotedTo) {
        board[lastMoveData.fromRow][lastMoveData.fromCol] = lastMoveData.piece;
        board[lastMoveData.toRow][lastMoveData.toCol] = lastMoveData.captured || '';
    } else {
        board[lastMoveData.fromRow][lastMoveData.fromCol] = lastMoveData.piece;
        board[lastMoveData.toRow][lastMoveData.toCol] = lastMoveData.captured || '';
    }
    
    if (lastMoveData.castling) {
        board[lastMoveData.fromRow][lastMoveData.rookFromCol] = lastMoveData.rook;
        board[lastMoveData.fromRow][lastMoveData.rookToCol] = '';
    }
    
    if (lastMoveData.enPassant) {
        board[lastMoveData.enPassantCapturedRow][lastMoveData.enPassantCapturedCol] = lastMoveData.enPassantCapturedPawn;
        const capturedColor = getPieceColor(lastMoveData.enPassantCapturedPawn);
        capturedPieces[capturedColor].pop();
    }
    
    if (lastMoveData.captured && !lastMoveData.enPassant) {
        const capturedColor = getPieceColor(lastMoveData.captured);
        capturedPieces[capturedColor].pop();
    }
    
    castlingRights = lastMoveData.previousCastlingRights;
    enPassantTarget = lastMoveData.previousEnPassantTarget;
    lastMove = lastMoveData.previousLastMove;
    
    currentPlayer = currentPlayer === 'white' ? 'black' : 'white';
    
    selectedSquare = null;
    validMoves = [];
    
    renderBoard();
    updateStatus();
    updateCapturedPieces();
}

function updateStatus() {
    const inCheck = isKingInCheck(currentPlayer);
    const playerName = currentPlayer === 'white' ? 'Vit' : 'Svart';
    
    if (pendingPromotion) {
        statusElement.textContent = 'Välj pjäs för befordran...';
    } else if (inCheck) {
        statusElement.textContent = `${playerName}:s tur - SCHACK!`;
    } else {
        statusElement.textContent = `${playerName}:s tur`;
    }
    
    statusElement.className = currentPlayer === 'white' ? 'white-turn' : 'black-turn';
}

function updateCapturedPieces() {
    capturedWhiteElement.textContent = capturedPieces.white.map(p => getPieceSymbol(p)).join(' ');
    capturedBlackElement.textContent = capturedPieces.black.map(p => getPieceSymbol(p)).join(' ');
}

function checkGameOver() {
    let hasValidMoves = false;
    
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const piece = board[row][col];
            if (piece && getPieceColor(piece) === currentPlayer) {
                const moves = getValidMoves(row, col);
                if (moves.length > 0) {
                    hasValidMoves = true;
                    break;
                }
            }
        }
        if (hasValidMoves) break;
    }
    
    if (!hasValidMoves) {
        gameOver = true;
        
        let message;
        if (isKingInCheck(currentPlayer)) {
            const winner = currentPlayer === 'white' ? 'Svart' : 'Vit';
            message = `SCHACKMATT! ${winner} vinner!`;
        } else {
            message = 'PATT! Oavgjort!';
        }
        
        statusElement.textContent = message;
        
        // Show game over menu in multiplayer
        if (isMultiplayer) {
            showGameOverMenu(message);
        }
    }
}

// ==================== EVENT LISTENERS ====================

resetBtn.addEventListener('click', initGame);
undoBtn.addEventListener('click', undoMove);

promotionButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        const pieceType = btn.getAttribute('data-piece');
        handlePromotionChoice(pieceType);
    });
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (pendingPromotion) return;
        if (isDragging) {
            cleanupDrag();
        }
        selectedSquare = null;
        validMoves = [];
        renderBoard();
    }
});

promotionModal.addEventListener('click', (e) => {
    e.stopPropagation();
});

// Initialize game
initGame();

// ==================== MULTIPLAYER ====================

// Connect to server
function connectToServer() {
    // Auto-detect: use current URL in production, localhost in development
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
    
    socket.on('game-created', (data) => {
    gameId = data.gameId;
    myColor = data.color;
    isMultiplayer = true;
    isMyTurn = myColor === 'white';
    gameOver = false;
    boardFlipped = false;
        
         hideMultiplayerMenu();
    hideGameOverMenu();
    showMessage(`Spel skapat! Kod: ${gameId}\nDela koden med din motståndare.`);
    showGameCode(gameId);
    
    initGame();
    updateRowColLabels();
    updateMultiplayerStatus();
});

        socket.on('rematch-requested', (data) => {
    showGameOverMenu(data.message);
});

socket.on('rematch-waiting', (data) => {
    waitingForRematch = true;
    gameOverMessage.textContent = data.message;
    gameOverMessage.classList.add('waiting-rematch');
    rematchBtn.disabled = true;
    rematchBtn.textContent = 'Väntar...';
});

socket.on('rematch-started', (data) => {
    // Update color
    myColor = data.color;
    isMyTurn = myColor === 'white';
    waitingForRematch = false;
    
    // Reset board flip to match new color
    boardFlipped = myColor === 'black';
    
    // Hide game over menu
    hideGameOverMenu();
    
    // Reset game
    gameOver = false;
    initGame();
    
    showMessage(data.message);
    updateMultiplayerStatus();
});

socket.on('rematch-declined', (data) => {
    waitingForRematch = false;
    showMessage(data.message);
    resetRematchButton();
});
    
    socket.on('game-joined', (data) => {
    gameId = data.gameId;
    myColor = data.color;
    isMultiplayer = true;
    isMyTurn = myColor === 'white';
    gameOver = false;
    boardFlipped = myColor === 'black';  // Black gets flipped board
    
    hideMultiplayerMenu();
    hideGameOverMenu();
    showMessage('Ansluten! Spelet börjar.');
    
    initGame();
    updateRowColLabels();
    
    if (data.moves && data.moves.length > 0) {
        replayMoves(data.moves);
    }
    
    updateMultiplayerStatus();
});
    
    socket.on('opponent-joined', (data) => {
        showMessage(data.message);
        updateMultiplayerStatus();
    });
    
    socket.on('opponent-move', (moveData) => {
    // Set isMyTurn BEFORE executing so renderBoard enables squares
    isMyTurn = true;
    executeOpponentMove(moveData);
    updateMultiplayerStatus();
});
    
    socket.on('move-confirmed', (moveData) => {
        isMyTurn = false;
        updateMultiplayerStatus();
    });
    
    socket.on('opponent-disconnected', () => {
        showMessage('Motståndaren kopplade ifrån');
    });
    
    socket.on('opponent-resigned', () => {
        showMessage('Motståndaren gav upp! Du vann!');
        isMultiplayer = false;
    });
    
    socket.on('draw-offered', () => {
        if (confirm('Motståndaren erbjuder remi. Acceptera?')) {
            socket.emit('accept-draw');
        } else {
            socket.emit('decline-draw');
        }
    });
    
    socket.on('draw-declined', () => {
        showMessage('Remi avböjdes');
    });
    
    socket.on('game-over', (result) => {
        let message;
        if (result.winner === null) {
            message = `Remi: ${result.reason}`;
        } else {
            message = result.winner === myColor ? 'Du vann!' : 'Du förlorade!';
        }
        showMessage(message);
        isMultiplayer = false;
    });
}

// Create new game
function createGame() {
    if (socket && socket.connected) {
        socket.emit('create-game');
    }
}

// Join existing game
function joinGame(code) {
    if (socket && socket.connected) {
        socket.emit('join-game', code);
    }
}

// Send move to server
function sendMove(fromRow, fromCol, toRow, toCol, moveData) {
    if (isMultiplayer && socket && socket.connected) {
        socket.emit('move', {
            fromRow,
            fromCol,
            toRow,
            toCol,
            ...moveData
        });
    }
}

// Execute opponent's move
function executeOpponentMove(moveData) {
    const { fromRow, fromCol, toRow, toCol } = moveData;
    const piece = board[fromRow][fromCol];
    const captured = board[toRow][toCol];
    const color = getPieceColor(piece);
    
    // If it's a promotion, include the promoted piece
    if (moveData.promotedTo) {
        executeMove(fromRow, fromCol, toRow, toCol, piece, captured, color, moveData, moveData.promotedTo);
    } else {
        executeMove(fromRow, fromCol, toRow, toCol, piece, captured, color, moveData);
    }
}

// Replay moves (when joining ongoing game)
function replayMoves(moves) {
    moves.forEach(moveData => {
        executeOpponentMove(moveData);
    });
}

// Resign game
function resignGame() {
    if (isMultiplayer && socket && confirm('Är du säker på att du vill ge upp?')) {
        socket.emit('resign');
        showMessage('Du gav upp');
        isMultiplayer = false;
    }
}

// Offer draw
function offerDraw() {
    if (isMultiplayer && socket) {
        socket.emit('offer-draw');
        showMessage('Remi erbjuden...');
    }
}

// Flip board for black player

function flipBoard() {
    boardFlipped = !boardFlipped;
    renderBoard();
}

// Update multiplayer status
function updateMultiplayerStatus() {
    if (!isMultiplayer) return;
    if (gameOver) return;
    
    const statusText = isMyTurn ? 'Din tur' : 'Motståndarens tur';
    const colorText = myColor === 'white' ? '(Vit)' : '(Svart)';
    
    statusElement.textContent = `${statusText} ${colorText}`;
}

// Show message to user
function showMessage(message) {
    alert(message); // Simple alert, can be replaced with modal
}

// ==================== MODIFY EXISTING FUNCTIONS ====================

// Modify makeMove to send move to server
const originalMakeMove = makeMove;
makeMove = function(fromRow, fromCol, toRow, toCol, moveData = {}) {
    // In multiplayer, only allow moves on your turn
    if (isMultiplayer && !isMyTurn) {
        return;
    }
    
    // In multiplayer, only allow moving your own pieces
    if (isMultiplayer) {
        const piece = board[fromRow][fromCol];
        if (getPieceColor(piece) !== myColor) {
            return;
        }
    }
    
    // Call original function
    originalMakeMove(fromRow, fromCol, toRow, toCol, moveData);
    
    // Send move to server
    if (isMultiplayer && !moveData.promotion) {
        sendMove(fromRow, fromCol, toRow, toCol, moveData);
    }
};

// Modify executeMove to send promotion moves
const originalExecuteMove = executeMove;
executeMove = function(fromRow, fromCol, toRow, toCol, piece, captured, color, moveData, promotedPiece = null) {
    originalExecuteMove(fromRow, fromCol, toRow, toCol, piece, captured, color, moveData, promotedPiece);
    
    // Send promotion move to server
    if (isMultiplayer && moveData.promotion && promotedPiece && color === myColor) {
        sendMove(fromRow, fromCol, toRow, toCol, { ...moveData, promotedTo: promotedPiece });
    }
};

// Modify renderBoard for flipped board
const originalRenderBoard = renderBoard;
renderBoard = function() {
    boardElement.innerHTML = '';
    boardElement.classList.toggle('is-dragging', isDragging);
    
    const rowStart = boardFlipped ? 7 : 0;
    const rowEnd = boardFlipped ? -1 : 8;
    const rowStep = boardFlipped ? -1 : 1;
    const colStart = boardFlipped ? 7 : 0;
    const colEnd = boardFlipped ? -1 : 8;
    const colStep = boardFlipped ? -1 : 1;
    
    for (let r = rowStart; boardFlipped ? r > rowEnd : r < rowEnd; r += rowStep) {
        for (let c = colStart; boardFlipped ? c > colEnd : c < colEnd; c += colStep) {
            const row = r;
            const col = c;
            
            // ... rest of square creation logic (same as before)
            const square = document.createElement('button');
            const isLight = (row + col) % 2 === 0;
            
            square.className = `square ${isLight ? 'light' : 'dark'}`;
            square.setAttribute('data-row', row);
            square.setAttribute('data-col', col);
            square.setAttribute('aria-label', getSquareLabel(row, col));
            
            if (pendingPromotion) {
                square.disabled = true;
            }
            
            // Disable interaction if not your turn in multiplayer
            if (isMultiplayer && !isMyTurn) {
                square.disabled = true;
            }
            
            const piece = board[row][col];
            if (piece) {
                const pieceSpan = document.createElement('span');
                pieceSpan.className = `piece ${getPieceColor(piece)}`;
                pieceSpan.textContent = getPieceSymbol(piece);
                
                // Only allow dragging your own pieces in multiplayer
                const canDrag = !isMultiplayer || (getPieceColor(piece) === myColor && isMyTurn);
                
                if (getPieceColor(piece) === currentPlayer && !pendingPromotion && canDrag) {
                    pieceSpan.draggable = true;
                    pieceSpan.setAttribute('data-row', row);
                    pieceSpan.setAttribute('data-col', col);
                }
                
                square.appendChild(pieceSpan);
            }
            
            // All the highlighting logic (same as before)
            if (lastMove) {
                if ((row === lastMove.fromRow && col === lastMove.fromCol) ||
                    (row === lastMove.toRow && col === lastMove.toCol)) {
                    square.classList.add('last-move');
                }
            }
            
            if (selectedSquare && selectedSquare.row === row && selectedSquare.col === col) {
                square.classList.add('selected');
            }
            
            const validMove = validMoves.find(move => move.row === row && move.col === col);
            if (validMove) {
                if (board[row][col] || validMove.enPassant) {
                    square.classList.add('valid-capture');
                } else {
                    square.classList.add('valid-move');
                }
            }
            
            if (isDragging && dragValidMoves.length > 0) {
                const dragMove = dragValidMoves.find(move => move.row === row && move.col === col);
                if (dragMove) {
                    if (board[row][col] || dragMove.enPassant) {
                        square.classList.add('can-capture');
                    } else {
                        square.classList.add('can-move');
                    }
                }
            }
            
            if (isKingInCheck(currentPlayer)) {
                const kingPos = findKing(currentPlayer);
                if (kingPos && kingPos.row === row && kingPos.col === col) {
                    square.classList.add('in-check');
                }
            }
            
            square.addEventListener('click', () => handleSquareClick(row, col));
            square.addEventListener('dragover', handleDragOver);
            square.addEventListener('dragenter', handleDragEnter);
            square.addEventListener('dragleave', handleDragLeave);
            square.addEventListener('drop', handleDrop);
            
            boardElement.appendChild(square);
        }
    }
    
    const pieces = boardElement.querySelectorAll('.piece[draggable="true"]');
    pieces.forEach(piece => {
        piece.addEventListener('dragstart', handleDragStart);
        piece.addEventListener('dragend', handleDragEnd);
    });
    
    addTouchListeners();
};

// Disable undo in multiplayer
const originalUndoMove = undoMove;
undoMove = function() {
    if (isMultiplayer) {
        showMessage('Ångra är inte tillgängligt i flerspelarläge');
        return;
    }
    originalUndoMove();
};

// ==================== MULTIPLAYER UI ====================

// DOM elements for multiplayer
const multiplayerMenu = document.getElementById('multiplayer-menu');
const gameCodeDisplay = document.getElementById('game-code-display');
const gameCodeElement = document.getElementById('game-code');
const createGameBtn = document.getElementById('create-game-btn');
const joinGameBtn = document.getElementById('join-game-btn');
const gameCodeInput = document.getElementById('game-code-input');
const localGameBtn = document.getElementById('local-game-btn');
const copyCodeBtn = document.getElementById('copy-code-btn');
const resignBtn = document.getElementById('resign-btn');
const drawBtn = document.getElementById('draw-btn');
const multiplayerControls = document.getElementById('multiplayer-controls');

function showMultiplayerMenu() {
    multiplayerMenu.style.display = 'block';
    gameCodeDisplay.style.display = 'none';
    multiplayerControls.style.display = 'none';
}

function hideMultiplayerMenu() {
    multiplayerMenu.style.display = 'none';
    multiplayerControls.style.display = 'flex';
}

function showGameCode(code) {
    gameCodeDisplay.style.display = 'block';
    gameCodeElement.textContent = code;
}

function hideGameCode() {
    gameCodeDisplay.style.display = 'none';
}

// Event listeners for multiplayer UI
createGameBtn.addEventListener('click', () => {
    createGame();
});

joinGameBtn.addEventListener('click', () => {
    const code = gameCodeInput.value.trim().toUpperCase();
    if (code.length > 0) {
        joinGame(code);
    } else {
        showMessage('Ange en spelkod');
    }
});

localGameBtn.addEventListener('click', () => {
    isMultiplayer = false;
    myColor = null;
    gameId = null;
    boardFlipped = false;
    hideMultiplayerMenu();
    hideGameCode();
    multiplayerControls.style.display = 'none';
    initGame();
});

copyCodeBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(gameCodeElement.textContent).then(() => {
        showMessage('Kod kopierad!');
    });
});

resignBtn.addEventListener('click', resignGame);
drawBtn.addEventListener('click', offerDraw);

// Allow Enter key to join game
gameCodeInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        joinGameBtn.click();
    }
});

// Auto-connect to server when page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, connecting to server...');
    connectToServer();
});

// ==================== GAME OVER MENU ====================

function showGameOverMenu(message = null) {
    if (!isMultiplayer) return;
    
    gameOverMenu.style.display = 'block';
    if (message) {
        gameOverMessage.textContent = message;
    }
    resetRematchButton();
}

function hideGameOverMenu() {
    gameOverMenu.style.display = 'none';
    resetRematchButton();
}

function resetRematchButton() {
    rematchBtn.disabled = false;
    rematchBtn.textContent = 'Ny match (byt färg)';
    gameOverMessage.classList.remove('waiting-rematch');
}

function requestRematch() {
    if (isMultiplayer && socket && socket.connected) {
        socket.emit('request-rematch');
    }
}

function returnToMenu() {
    // Disconnect from current game
    if (socket && socket.connected) {
        socket.disconnect();
        socket.connect();
    }
    
    // Reset all state
    isMultiplayer = false;
    myColor = null;
    gameId = null;
    gameOver = false;
    boardFlipped = false;
    waitingForRematch = false;
    
    // Hide game over menu and show multiplayer menu
    hideGameOverMenu();
    hideGameCode();
    multiplayerControls.style.display = 'none';
    showMultiplayerMenu();
    
    initGame();
}

// Manual flip board function
function manualFlipBoard() {
    boardFlipped = !boardFlipped;
    renderBoard();
    updateRowColLabels();
}

// Update row/column labels when board is flipped
function updateRowColLabels() {
    const rowLabels = document.querySelector('.row-labels');
    const colLabels = document.querySelector('.col-labels');
    
    if (boardFlipped) {
        rowLabels.innerHTML = '<span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span>';
        colLabels.innerHTML = '<span>h</span><span>g</span><span>f</span><span>e</span><span>d</span><span>c</span><span>b</span><span>a</span>';
    } else {
        rowLabels.innerHTML = '<span>8</span><span>7</span><span>6</span><span>5</span><span>4</span><span>3</span><span>2</span><span>1</span>';
        colLabels.innerHTML = '<span>a</span><span>b</span><span>c</span><span>d</span><span>e</span><span>f</span><span>g</span><span>h</span>';
    }
}

// Flip board button
flipBtn.addEventListener('click', manualFlipBoard);

// Rematch button
rematchBtn.addEventListener('click', requestRematch);

// New game button (return to menu)
newGameBtn.addEventListener('click', returnToMenu);

// ==================== DEBUG ====================
console.log('Script loaded');
console.log('Socket.io available:', typeof io !== 'undefined');
console.log('Create button found:', createGameBtn !== null);
console.log('Join button found:', joinGameBtn !== null);

// Test button directly
if (createGameBtn) {
    console.log('Adding test click listener');
    createGameBtn.addEventListener('click', () => {
        console.log('Button clicked!');
        console.log('Socket exists:', socket !== null);
        console.log('Socket connected:', socket?.connected);
    });
}