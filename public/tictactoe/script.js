const cells = document.querySelectorAll('.cell');
const statusText = document.getElementById('status');
const resetBtn = document.getElementById('reset-btn');

let board = ['', '', '', '', '', '', '', '', ''];
let currentPlayer = 'X';
let gameActive = true;

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

function handleCellClick(e) {
    const cell = e.target;
    const index = cell.getAttribute('data-index');
    
    if (board[index] !== '' || !gameActive) {
        return;
    }
    
    updateCell(cell, index);
    checkWinner();
}

function updateCell(cell, index) {
    board[index] = currentPlayer;
    cell.textContent = currentPlayer;
    cell.disabled = true;
    cell.classList.add(currentPlayer.toLowerCase());
}

function checkWinner() {
    let roundWon = false;
    
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
            break;
        }
    }
    
    if (roundWon) {
        statusText.textContent = `Spelare ${currentPlayer} vinner!`;
        gameActive = false;
        return;
    }
    
    if (!board.includes('')) {
        statusText.textContent = `Oavgjort!`;
        gameActive = false;
        return;
    }
    
    changePlayer();
}

function changePlayer() {
    currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
    statusText.textContent = `Spelare ${currentPlayer}:s tur`;
}

function resetGame() {
    board = ['', '', '', '', '', '', '', '', ''];
    currentPlayer = 'X';
    gameActive = true;
    
    statusText.textContent = `Spelare ${currentPlayer}:s tur`;
    
    cells.forEach(cell => {
        cell.textContent = '';
        cell.disabled = false;
        cell.classList.remove('x', 'o');
    });
}

cells.forEach(cell => {
    cell.addEventListener('click', handleCellClick);
});

resetBtn.addEventListener('click', resetGame);