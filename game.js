(function () {
    'use strict';

    // ========== КОНСТАНТЫ ==========
    const BOARD_SIZE = 8;
    const EMPTY = 0;
    const BLACK = 1; // игрок
    const WHITE = 2; // компьютер

    const DIRECTIONS = [
        [-1, -1], [-1, 0], [-1, 1],
        [0, -1],           [0, 1],
        [1, -1],  [1, 0],  [1, 1]
    ];

    // ========== СОСТОЯНИЕ ==========
    let board = [];
    let currentPlayer = BLACK;
    let gameOver = false;
    let difficulty = 'easy';
    let isComputerThinking = false;
    let wins = 0;
    let isVKAvailable = false;

    // ========== DOM ==========
    const canvas = document.getElementById('boardCanvas');
    const ctx = canvas.getContext('2d');
    const blackScoreSpan = document.getElementById('blackScore');
    const whiteScoreSpan = document.getElementById('whiteScore');
    const turnIndicator = document.getElementById('turnIndicator');
    const messageDiv = document.getElementById('message');
    const difficultyPanel = document.getElementById('difficultyPanel');
    const newGameBtn = document.getElementById('newGameBtn');
    const shareBtn = document.getElementById('shareBtn');
    const modalOverlay = document.getElementById('modalOverlay');
    const modalTitle = document.getElementById('modalTitle');
    const modalText = document.getElementById('modalText');
    const modalNewGame = document.getElementById('modalNewGame');
    const modalShare = document.getElementById('modalShare');
    const greetingEl = document.getElementById('greeting');
    const statsEl = document.getElementById('stats');
    const userAvatar = document.getElementById('userAvatar');

    // ========== VK BRIDGE ==========
    async function initVK() {
        if (typeof vkBridge === 'undefined') {
            console.log('VK Bridge не загружен — работаем вне ВК');
            statsEl.textContent = `Побед: ${wins}`;
            return;
        }

        try {
            await vkBridge.send('VKWebAppInit');
            isVKAvailable = true;
            console.log('VK Bridge инициализирован');

            // Подписка на события
            vkBridge.subscribe((e) => {
                if (e.detail.type === 'VKWebAppUpdateConfig') {
                    const scheme = e.detail.data.scheme;
                    document.body.classList.toggle('dark', scheme === 'space_gray');
                }
            });

            // Данные пользователя
            try {
                const userInfo = await vkBridge.send('VKWebAppGetUserInfo');
                if (userInfo) {
                    greetingEl.textContent = `Привет, ${userInfo.first_name}!`;
                    if (userInfo.photo_100) {
                        userAvatar.src = userInfo.photo_100;
                        userAvatar.style.display = 'block';
                    }
                }
            } catch (err) {
                console.warn('Не удалось получить данные пользователя:', err);
            }

            // Загружаем сохранённый прогресс
            await loadProgress();
        } catch (err) {
            console.warn('VK Bridge недоступен:', err);
            statsEl.textContent = `Побед: ${wins}`;
        }
    }

    // ========== СОХРАНЕНИЕ ПРОГРЕССА ==========
    async function loadProgress() {
        try {
            const { keys } = await vkBridge.send('VKWebAppStorageGet', {
                keys: ['reverse_wins']
            });
            if (keys && keys[0] && keys[0].value) {
                wins = parseInt(keys[0].value, 10) || 0;
            }
            statsEl.textContent = `Побед: ${wins}`;
        } catch (err) {
            console.warn('Ошибка загрузки прогресса:', err);
            statsEl.textContent = `Побед: ${wins}`;
        }
    }

    async function saveProgress() {
        if (!isVKAvailable) return;
        try {
            await vkBridge.send('VKWebAppStorageSet', {
                key: 'reverse_wins',
                value: String(wins)
            });
        } catch (err) {
            console.warn('Ошибка сохранения:', err);
        }
    }

    // ========== ПОДЕЛИТЬСЯ ==========
    async function shareResult() {
        const { black, white } = countDiscs();
        let resultText;
        if (black > white) resultText = `Я выиграл в Реверси со счётом ${black}:${white}! 🏆`;
        else if (white > black) resultText = `Компьютер обыграл меня ${white}:${black} 😢`;
        else resultText = `Ничья в Реверси ${black}:${white} 🤝`;

        if (isVKAvailable) {
            try {
                await vkBridge.send('VKWebAppShare', {
                    link: 'https://vk.com/app' // ← укажите ID вашего приложения после создания
                });
                return;
            } catch (err) {
                console.warn('VKWebAppShare недоступен:', err);
            }
        }

        // Фолбэк — копируем в буфер обмена
        if (navigator.clipboard) {
            try {
                await navigator.clipboard.writeText(resultText);
                messageDiv.textContent = 'Результат скопирован!';
                setTimeout(() => messageDiv.textContent = '', 2000);
            } catch (e) {
                messageDiv.textContent = resultText;
            }
        } else {
            messageDiv.textContent = resultText;
        }
    }

    // ========== ЛОГИКА ИГРЫ ==========
    function initBoard() {
        board = Array(BOARD_SIZE).fill().map(() => Array(BOARD_SIZE).fill(EMPTY));
        board[3][3] = WHITE;
        board[4][4] = WHITE;
        board[3][4] = BLACK;
        board[4][3] = BLACK;
    }

    function isOnBoard(r, c) {
        return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
    }

    function isValidMove(row, col, player) {
        return isValidMoveOnBoard(board, row, col, player);
    }

    function isValidMoveOnBoard(boardState, row, col, player) {
        if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) return false;
        if (boardState[row][col] !== EMPTY) return false;
        const opponent = player === BLACK ? WHITE : BLACK;

        for (const [dx, dy] of DIRECTIONS) {
            let r = row + dx;
            let c = col + dy;
            let foundOpponent = false;

            while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && boardState[r][c] === opponent) {
                foundOpponent = true;
                r += dx;
                c += dy;
            }

            if (foundOpponent && r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && boardState[r][c] === player) {
                return true;
            }
        }
        return false;
    }

    function getValidMoves(player) {
        return getAllValidMoves(board, player);
    }

    function getAllValidMoves(boardState, player) {
        const moves = [];
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (isValidMoveOnBoard(boardState, r, c, player)) {
                    moves.push([r, c]);
                }
            }
        }
        return moves;
    }

    function makeMove(row, col, player) {
        if (!isValidMove(row, col, player)) return 0;
        return simulateMoveOnCopy(board, row, col, player);
    }

    function simulateMoveOnCopy(boardState, row, col, player) {
        const opponent = player === BLACK ? WHITE : BLACK;
        let flipped = 0;
        boardState[row][col] = player;

        for (const [dx, dy] of DIRECTIONS) {
            let r = row + dx;
            let c = col + dy;
            const toFlip = [];

            while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && boardState[r][c] === opponent) {
                toFlip.push([r, c]);
                r += dx;
                c += dy;
            }

            if (toFlip.length > 0 && r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && boardState[r][c] === player) {
                for (const [fr, fc] of toFlip) {
                    boardState[fr][fc] = player;
                    flipped++;
                }
            }
        }
        return flipped;
    }

    function countDiscs() {
        let black = 0, white = 0;
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (board[r][c] === BLACK) black++;
                else if (board[r][c] === WHITE) white++;
            }
        }
        return { black, white };
    }

    // ========== ОТРИСОВКА ==========
    const CELL_SIZE = canvas.width / BOARD_SIZE;

    function drawBoard() {
        ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--board-bg').trim() || '#2e5e3b';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--board-line').trim() || '#1e3b27';
        ctx.lineWidth = 4;
        for (let i = 0; i <= BOARD_SIZE; i++) {
            ctx.beginPath();
            ctx.moveTo(i * CELL_SIZE, 0);
            ctx.lineTo(i * CELL_SIZE, canvas.height);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i * CELL_SIZE);
            ctx.lineTo(canvas.width, i * CELL_SIZE);
            ctx.stroke();
        }

        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (board[r][c] === EMPTY) continue;
                const x = c * CELL_SIZE + CELL_SIZE / 2;
                const y = r * CELL_SIZE + CELL_SIZE / 2;
                const radius = CELL_SIZE * 0.38;

                ctx.shadowColor = 'rgba(0,0,0,0.6)';
                ctx.shadowBlur = 10;
                ctx.shadowOffsetY = 3;
                ctx.shadowOffsetX = 2;

                const gradient = ctx.createRadialGradient(x - 5, y - 5, radius * 0.2, x, y, radius * 1.2);
                if (board[r][c] === BLACK) {
                    gradient.addColorStop(0, '#666');
                    gradient.addColorStop(0.7, '#111');
                    gradient.addColorStop(1, '#000');
                } else {
                    gradient.addColorStop(0, '#fff');
                    gradient.addColorStop(0.6, '#ddd');
                    gradient.addColorStop(1, '#a0a0a0');
                }
                ctx.beginPath();
                ctx.arc(x, y, radius, 0, Math.PI * 2);
                ctx.fillStyle = gradient;
                ctx.fill();

                ctx.shadowBlur = 0;
                ctx.shadowOffsetY = 0;
                ctx.shadowOffsetX = 0;
                ctx.beginPath();
                ctx.arc(x - 4, y - 4, radius * 0.2, 0, Math.PI * 2);
                ctx.fillStyle = board[r][c] === BLACK ? '#aaa' : '#ffffffd0';
                ctx.fill();
            }
        }

        // Подсветка ходов игрока
        if (!gameOver && currentPlayer === BLACK && !isComputerThinking) {
            const validMoves = getValidMoves(BLACK);
            for (const [r, c] of validMoves) {
                const x = c * CELL_SIZE + CELL_SIZE / 2;
                const y = r * CELL_SIZE + CELL_SIZE / 2;
                ctx.beginPath();
                ctx.arc(x, y, CELL_SIZE * 0.18, 0, Math.PI * 2);
                ctx.fillStyle = '#f4d03fcc';
                ctx.shadowColor = '#f1c40f';
                ctx.shadowBlur = 15;
                ctx.fill();
                ctx.shadowBlur = 0;
            }
        }
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        ctx.shadowOffsetX = 0;
    }

    // ========== UI ==========
    function updateUI() {
        const { black, white } = countDiscs();
        blackScoreSpan.textContent = black;
        whiteScoreSpan.textContent = white;

        if (gameOver) {
            if (black > white) turnIndicator.textContent = '🏆 Вы победили!';
            else if (white > black) turnIndicator.textContent = '🤖 Компьютер победил';
            else turnIndicator.textContent = '🤝 Ничья';
            return;
        }

        turnIndicator.textContent = currentPlayer === BLACK
            ? 'Ваш ход (чёрные)'
            : 'Ход компьютера (белые)';
    }

    function showGameOverModal() {
        const { black, white } = countDiscs();
        let title, text;

        if (black > white) {
            title = '🏆 Победа!';
            text = `Вы выиграли со счётом ${black}:${white}`;
            wins++;
            statsEl.textContent = `Побед: ${wins}`;
            saveProgress();
        } else if (white > black) {
            title = '😢 Поражение';
            text = `Компьютер победил ${white}:${black}`;
        } else {
            title = '🤝 Ничья';
            text = `Счёт ${black}:${white}`;
        }

        modalTitle.textContent = title;
        modalText.textContent = text;
        modalOverlay.classList.add('show');
    }

    function hideModal() {
        modalOverlay.classList.remove('show');
    }

    // ========== ХОД ИГРОКА ==========
    function handleCanvasClick(e) {
        if (gameOver || currentPlayer !== BLACK || isComputerThinking) return;

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        let clientX, clientY;
        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        const mouseX = (clientX - rect.left) * scaleX;
        const mouseY = (clientY - rect.top) * scaleY;

        const col = Math.floor(mouseX / CELL_SIZE);
        const row = Math.floor(mouseY / CELL_SIZE);

        if (!isOnBoard(row, col)) return;
        if (!isValidMove(row, col, BLACK)) {
            messageDiv.textContent = 'Недопустимый ход!';
            setTimeout(() => messageDiv.textContent = '', 800);
            return;
        }

        makeMove(row, col, BLACK);
        messageDiv.textContent = '';
        drawBoard();

        const whiteMoves = getValidMoves(WHITE);
        const blackMoves = getValidMoves(BLACK);

        if (whiteMoves.length === 0 && blackMoves.length === 0) {
            endGame();
            return;
        }

        if (whiteMoves.length > 0) {
            currentPlayer = WHITE;
            updateUI();
            drawBoard();
            isComputerThinking = true;
            setTimeout(() => computerMove(), 400);
        } else {
            messageDiv.textContent = 'У компьютера нет ходов. Ваш ход снова.';
            currentPlayer = BLACK;
            if (blackMoves.length === 0) endGame();
            updateUI();
            drawBoard();
        }
    }

    function endGame() {
        gameOver = true;
        isComputerThinking = false;
        updateUI();
        drawBoard();
        setTimeout(showGameOverModal, 400);
    }

    // ========== ИИ ==========
    function computerMove() {
        if (gameOver || currentPlayer !== WHITE) {
            isComputerThinking = false;
            return;
        }

        const validMoves = getValidMoves(WHITE);
        if (validMoves.length === 0) {
            isComputerThinking = false;
            currentPlayer = BLACK;
            updateUI();
            drawBoard();
            return;
        }

        let selectedMove;

        if (difficulty === 'easy') {
            selectedMove = validMoves[Math.floor(Math.random() * validMoves.length)];
        } else if (difficulty === 'medium') {
            let bestScore = -1;
            for (const [r, c] of validMoves) {
                const copy = board.map(row => [...row]);
                const flipped = simulateMoveOnCopy(copy, r, c, WHITE);
                if (flipped > bestScore) {
                    bestScore = flipped;
                    selectedMove = [r, c];
                }
            }
        } else {
            selectedMove = getBestMoveMinimax(validMoves, 3);
        }

        if (selectedMove) {
            makeMove(selectedMove[0], selectedMove[1], WHITE);
        }

        drawBoard();

        const blackMoves = getValidMoves(BLACK);
        const whiteMoves = getValidMoves(WHITE);

        if (blackMoves.length === 0 && whiteMoves.length === 0) {
            endGame();
            return;
        }

        if (blackMoves.length > 0) {
            currentPlayer = BLACK;
            messageDiv.textContent = '';
            isComputerThinking = false;
            updateUI();
            drawBoard();
        } else {
            if (whiteMoves.length > 0) {
                messageDiv.textContent = 'У вас нет ходов. Компьютер ходит ещё раз.';
                isComputerThinking = false;
                updateUI();
                drawBoard();
                setTimeout(() => {
                    isComputerThinking = true;
                    computerMove();
                }, 700);
            } else {
                endGame();
            }
        }
    }

    function getBestMoveMinimax(validMoves, depth) {
        let bestScore = -Infinity;
        let bestMove = validMoves[0];

        for (const [r, c] of validMoves) {
            const boardCopy = board.map(row => [...row]);
            simulateMoveOnCopy(boardCopy, r, c, WHITE);
            const score = minimax(boardCopy, depth - 1, false, -Infinity, Infinity);
            if (score > bestScore) {
                bestScore = score;
                bestMove = [r, c];
            }
        }
        return bestMove;
    }

    function evaluateBoard(boardState) {
        let white = 0, black = 0;
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (boardState[r][c] === WHITE) white++;
                else if (boardState[r][c] === BLACK) black++;
            }
        }
        return white - black;
    }

    function minimax(boardState, depth, isMaximizing, alpha, beta) {
        const blackMoves = getAllValidMoves(boardState, BLACK);
        const whiteMoves = getAllValidMoves(boardState, WHITE);

        if (depth === 0 || (blackMoves.length === 0 && whiteMoves.length === 0)) {
            return evaluateBoard(boardState);
        }

        if (isMaximizing) {
            if (whiteMoves.length === 0) {
                return minimax(boardState, depth - 1, false, alpha, beta);
            }
            let maxEval = -Infinity;
            for (const [r, c] of whiteMoves) {
                const newBoard = boardState.map(row => [...row]);
                simulateMoveOnCopy(newBoard, r, c, WHITE);
                const evalScore = minimax(newBoard, depth - 1, false, alpha, beta);
                maxEval = Math.max(maxEval, evalScore);
                alpha = Math.max(alpha, evalScore);
                if (beta <= alpha) break;
            }
            return maxEval;
        } else {
            if (blackMoves.length === 0) {
                return minimax(boardState, depth - 1, true, alpha, beta);
            }
            let minEval = Infinity;
            for (const [r, c] of blackMoves) {
                const newBoard = boardState.map(row => [...row]);
                simulateMoveOnCopy(newBoard, r, c, BLACK);
                const evalScore = minimax(newBoard, depth - 1, true, alpha, beta);
                minEval = Math.min(minEval, evalScore);
                beta = Math.min(beta, evalScore);
                if (beta <= alpha) break;
            }
            return minEval;
        }
    }

    // ========== СБРОС ==========
    function resetGame() {
        isComputerThinking = false;
        gameOver = false;
        currentPlayer = BLACK;
        messageDiv.textContent = '';
        hideModal();
        initBoard();
        updateUI();
        drawBoard();
    }

    function setDifficulty(level) {
        difficulty = level;
        document.querySelectorAll('.difficulty-panel button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.level === level);
        });
        resetGame();
    }

    // ========== СОБЫТИЯ ==========
    canvas.addEventListener('click', handleCanvasClick);

    newGameBtn.addEventListener('click', resetGame);
    modalNewGame.addEventListener('click', resetGame);

    shareBtn.addEventListener('click', shareResult);
    modalShare.addEventListener('click', shareResult);

    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) hideModal();
    });

    difficultyPanel.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (btn && btn.dataset.level) {
            setDifficulty(btn.dataset.level);
        }
    });

    // ========== СТАРТ ==========
    initBoard();
    updateUI();
    drawBoard();
    initVK();
})();