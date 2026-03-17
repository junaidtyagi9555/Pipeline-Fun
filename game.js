// ===================== COMPLETELY FIXED GAME STATE =====================
// Main fix: Proper cleanup between games to prevent crashes

const store = (() => {
    let _data = { xp: 0, wins: 0, streak: 0 };
    try {
        _data = {
            xp: parseInt(localStorage.getItem('devops_xp')) || 0,
            wins: parseInt(localStorage.getItem('devops_wins')) || 0,
            streak: parseInt(localStorage.getItem('devops_streak')) || 0,
        };
    } catch(e) {
        console.warn('localStorage not available, using in-memory storage');
    }
    return {
        get: (k) => _data[k] || 0,
        set: (k, v) => {
            _data[k] = v;
            try { localStorage.setItem('devops_' + k, v.toString()); } catch(e) {}
        }
    };
})();

let gameState = {
    xp: store.get('xp'),
    wins: store.get('wins'),
    streak: store.get('streak'),
    currentGame: null,
    gameActive: false,
    animationFrame: null,
    timers: [],
    eventListeners: []
};

// DOM elements
const gameModal = document.getElementById('gameModal');
const modalContent = document.getElementById('modalContent');
const gameArea = document.getElementById('gameArea');
const toast = document.getElementById('toast');
const loader = document.getElementById('loader');
const closeModalBtn = document.getElementById('closeModalBtn');

// ===================== CLEANUP FUNCTION =====================
function cleanupGame() {
    console.log('Cleaning up previous game...');
    
    // Clear all timers
    gameState.timers.forEach(t => { 
        if (t) {
            clearTimeout(t); 
            clearInterval(t); 
        }
    });
    gameState.timers = [];
    
    // Cancel animation frame
    if (gameState.animationFrame) {
        cancelAnimationFrame(gameState.animationFrame);
        gameState.animationFrame = null;
    }
    
    // Remove racer key handler
    if (window._racerKeyHandler) {
        window.removeEventListener('keydown', window._racerKeyHandler);
        window._racerKeyHandler = null;
    }
    
    // Remove any other global event listeners
    gameState.eventListeners.forEach(({element, event, handler}) => {
        if (element) {
            element.removeEventListener(event, handler);
        }
    });
    gameState.eventListeners = [];
    
    // Remove any game over overlays
    if (modalContent) {
        const overlays = modalContent.querySelectorAll('.game-over-overlay');
        overlays.forEach(overlay => overlay.remove());
    }
    
    // Clear game area
    if (gameArea) {
        gameArea.innerHTML = '';
    }
    
    // Reset game active flag
    gameState.gameActive = false;
}

// Helper to track event listeners for cleanup
function addTrackedEventListener(element, event, handler) {
    if (!element) return;
    element.addEventListener(event, handler);
    gameState.eventListeners.push({ element, event, handler });
}

if (closeModalBtn) {
    closeModalBtn.addEventListener('click', () => {
        cleanupGame();
        if (gameModal) gameModal.classList.remove('active');
    });
}

// ===================== UTILITIES =====================
function updateScore() {
    const totalXPElement = document.getElementById('totalXP');
    const gamesWonElement = document.getElementById('gamesWon');
    const winStreakElement = document.getElementById('winStreak');
    
    if (totalXPElement) totalXPElement.textContent = gameState.xp;
    if (gamesWonElement) gamesWonElement.textContent = gameState.wins;
    if (winStreakElement) winStreakElement.textContent = gameState.streak;
    
    store.set('xp', gameState.xp);
    store.set('wins', gameState.wins);
    store.set('streak', gameState.streak);
}

let toastTimer = null;
function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
}

function showLoader(show) {
    if (loader) loader.style.display = show ? 'block' : 'none';
}

function closeGame() {
    cleanupGame();
    if (gameModal) gameModal.classList.remove('active');
}

function showGameOver({ title, emoji, xp, isWin, onRestart }) {
    if (!gameState.gameActive) return;
    
    gameState.gameActive = false;
    
    // Clear timers but don't fully cleanup because we need the overlay
    gameState.timers.forEach(t => { 
        if (t) {
            clearTimeout(t); 
            clearInterval(t); 
        }
    });
    gameState.timers = [];
    
    if (gameState.animationFrame) {
        cancelAnimationFrame(gameState.animationFrame);
        gameState.animationFrame = null;
    }

    if (isWin) {
        gameState.xp += xp;
        gameState.wins++;
        gameState.streak++;
    } else {
        gameState.streak = 0;
    }
    updateScore();

    if (!modalContent) return;

    // Remove any existing overlays
    const existingOverlay = modalContent.querySelector('.game-over-overlay');
    if (existingOverlay) existingOverlay.remove();

    const overlay = document.createElement('div');
    overlay.className = 'game-over-overlay';
    overlay.innerHTML = `
        <div style="font-size:4rem;">${emoji}</div>
        <h2>${title}</h2>
        ${isWin ? `<div class="xp-gained">+${xp} XP Earned!</div>` : `<p>Better luck next time!</p>`}
        <div>
            <button class="restart-btn" id="restartBtn">▶ Play Again</button>
            <button class="restart-btn secondary" id="quitBtn">✕ Quit</button>
        </div>
    `;
    
    modalContent.style.position = 'relative';
    modalContent.appendChild(overlay);

    const restartBtn = document.getElementById('restartBtn');
    const quitBtn = document.getElementById('quitBtn');
    
    if (restartBtn) {
        restartBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            overlay.remove();
            // Clean up before restarting
            cleanupGame();
            if (onRestart) onRestart();
        });
    }
    
    if (quitBtn) {
        quitBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            overlay.remove();
            closeGame();
        });
    }
}

// ===================== RACER GAME (FIXED) =====================
function startRacerGame() {
    cleanupGame();
    
    if (!gameArea || !modalContent) return;
    
    gameState.currentGame = 'racer';
    gameState.gameActive = true;
    modalContent.style.borderColor = '#3b82f6';

    gameArea.innerHTML = `
        <div class="racer-container">
            <canvas id="racerCanvas" width="800" height="450"></canvas>
            <div class="racer-stats">
                <div class="racer-stat"><div class="label">SCORE</div><div class="value" id="racerScore">0</div></div>
                <div class="racer-stat"><div class="label">PIPES</div><div class="value" id="racerPipes">0</div></div>
                <div class="racer-stat"><div class="label">SPEED</div><div class="value" id="racerSpeed">3.0</div></div>
            </div>
            <div class="control-hint">⬆️ TAP / CLICK / SPACE TO FLY  |  Survive as long as you can!</div>
        </div>
    `;

    const canvas = document.getElementById('racerCanvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');

    let bird = { x: 100, y: canvas.height / 2, width: 30, height: 20, velocity: 0 };
    let pipes = [];
    let frame = 0;
    let speed = 3;
    let pipesPassed = 0;
    let racerScore = 0;
    let gameRunning = true;

    function jump(e) {
        if (e) { 
            e.preventDefault(); 
            e.stopPropagation(); 
        }
        if (gameRunning && gameState.gameActive) bird.velocity = -6;
    }

    addTrackedEventListener(canvas, 'click', jump);
    addTrackedEventListener(canvas, 'touchstart', jump);

    window._racerKeyHandler = (e) => {
        if ((e.code === 'Space' || e.code === 'ArrowUp') && 
            gameModal && gameModal.classList.contains('active') && 
            gameRunning && gameState.gameActive) {
            e.preventDefault();
            jump(null);
        }
    };
    window.addEventListener('keydown', window._racerKeyHandler);

    function update() {
        if (!gameRunning || !gameState.gameActive) return false;

        bird.velocity += 0.25;
        bird.y += bird.velocity;

        if (frame % 80 === 0) {
            const gap = 175;
            const topHeight = Math.random() * (canvas.height - gap - 80) + 40;
            pipes.push({ x: canvas.width, top: topHeight, bottom: canvas.height - topHeight - gap, passed: false });
        }

        for (let i = pipes.length - 1; i >= 0; i--) {
            pipes[i].x -= speed;

            const bx = bird.x + 4, by = bird.y + 3, bw = bird.width - 8, bh = bird.height - 6;
            if (bx + bw > pipes[i].x && bx < pipes[i].x + 50) {
                if (by < pipes[i].top || by + bh > canvas.height - pipes[i].bottom) {
                    return false;
                }
            }

            if (pipes[i].x + 50 < bird.x && !pipes[i].passed) {
                pipes[i].passed = true;
                racerScore += 10;
                pipesPassed++;
                
                const scoreEl = document.getElementById('racerScore');
                const pipesEl = document.getElementById('racerPipes');
                const speedEl = document.getElementById('racerSpeed');
                
                if (scoreEl) scoreEl.textContent = racerScore;
                if (pipesEl) pipesEl.textContent = pipesPassed;

                if (pipesPassed % 5 === 0) {
                    racerScore += 25;
                    if (scoreEl) scoreEl.textContent = racerScore;
                    showToast(`🔥 Bonus +25 XP! Keep going!`);
                }
                if (pipesPassed % 10 === 0) {
                    speed += 0.5;
                    if (speedEl) speedEl.textContent = speed.toFixed(1);
                    showToast(`⚡ Speed up!`);
                }
            }

            if (pipes[i].x + 50 < 0) pipes.splice(i, 1);
        }

        if (bird.y < 0 || bird.y + bird.height > canvas.height) return false;

        frame++;
        return true;
    }

    function draw() {
        if (!ctx || !canvas) return;
        
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.strokeStyle = '#1e2d3d';
        ctx.lineWidth = 1;
        for (let i = 0; i < canvas.width; i += 50) {
            ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); ctx.stroke();
        }
        for (let i = 0; i < canvas.height; i += 50) {
            ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(canvas.width, i); ctx.stroke();
        }

        ctx.shadowBlur = 10;
        ctx.shadowColor = '#3b82f6';
        ctx.fillStyle = '#3b82f6';
        pipes.forEach(p => {
            ctx.fillRect(p.x, 0, 50, p.top);
            ctx.fillRect(p.x, canvas.height - p.bottom, 50, p.bottom);
            ctx.fillStyle = '#2563eb';
            ctx.fillRect(p.x - 3, p.top - 15, 56, 15);
            ctx.fillRect(p.x - 3, canvas.height - p.bottom, 56, 15);
            ctx.fillStyle = '#3b82f6';
        });

        ctx.shadowBlur = 20;
        ctx.shadowColor = '#f59e0b';
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.moveTo(bird.x + bird.width, bird.y + bird.height / 2);
        ctx.lineTo(bird.x, bird.y);
        ctx.lineTo(bird.x + 8, bird.y + bird.height / 2);
        ctx.lineTo(bird.x, bird.y + bird.height);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.moveTo(bird.x + 8, bird.y + bird.height / 2 - 4);
        ctx.lineTo(bird.x - 8 - Math.random() * 6, bird.y + bird.height / 2);
        ctx.lineTo(bird.x + 8, bird.y + bird.height / 2 + 4);
        ctx.closePath();
        ctx.fill();

        ctx.shadowBlur = 0;
    }

    function gameLoop() {
        if (!gameState.gameActive || !gameRunning) return;

        if (!update()) {
            gameRunning = false;
            draw();

            const earnedXP = Math.max(racerScore, 0);
            gameState.xp += earnedXP;
            gameState.streak = 0;
            updateScore();

            showGameOver({
                title: 'Crashed! 💥',
                emoji: '💥',
                xp: earnedXP,
                isWin: false,
                onRestart: startRacerGame
            });
            return;
        }

        draw();
        gameState.animationFrame = requestAnimationFrame(gameLoop);
    }

    gameLoop();
}

// ===================== MEMORY GAME (FIXED) =====================
function startMemoryGame() {
    cleanupGame();
    
    if (!gameArea || !modalContent) return;
    
    gameState.currentGame = 'memory';
    gameState.gameActive = true;
    modalContent.style.borderColor = '#8b5cf6';

    const pairs = [
        { emoji: '🔨', name: 'BUILD' },
        { emoji: '🧪', name: 'TEST' },
        { emoji: '🚀', name: 'DEPLOY' },
        { emoji: '📊', name: 'MONITOR' },
        { emoji: '🔧', name: 'CONFIG' },
        { emoji: '📦', name: 'PACKAGE' }
    ];

    let cards = [...pairs, ...pairs].map((c, i) => ({ ...c, id: i, matched: false, flipped: false }));
    for (let i = cards.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [cards[i], cards[j]] = [cards[j], cards[i]];
    }

    let flipped = [];
    let matches = 0;
    let attempts = 0;
    let locked = false;
    let startTime = Date.now();
    let timerInterval = null;

    function updateTimerDisplay() {
        if (!gameState.gameActive) return;
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const el = document.getElementById('memoryTimer');
        if (el) el.textContent = `⏱️ ${elapsed}s`;
    }

    function render() {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        let html = `
            <div class="memory-stats">
                <span>🎯 Matches: ${matches}/6</span>
                <span>🔄 Attempts: ${attempts}</span>
                <span id="memoryTimer">⏱️ ${elapsed}s</span>
            </div>
            <div class="memory-board">
        `;
        cards.forEach(c => {
            html += `
                <div class="memory-card ${c.flipped ? 'flipped' : ''} ${c.matched ? 'matched' : ''}"
                     data-id="${c.id}">
                    ${c.flipped || c.matched ? c.emoji : '❓'}
                </div>
            `;
        });
        html += '</div>';
        
        if (gameArea) gameArea.innerHTML = html;

        gameArea.querySelectorAll('.memory-card').forEach(el => {
            addTrackedEventListener(el, 'click', () => handleMemoryClick(parseInt(el.dataset.id)));
        });

        if (!timerInterval) {
            timerInterval = setInterval(updateTimerDisplay, 500);
            gameState.timers.push(timerInterval);
        }
    }

    function handleMemoryClick(id) {
        if (locked || !gameState.gameActive) return;
        const card = cards.find(c => c.id === id);
        if (!card || card.matched || card.flipped) return;

        card.flipped = true;
        flipped.push(card);
        attempts++;
        render();

        if (flipped.length === 2) {
            locked = true;
            if (flipped[0].name === flipped[1].name) {
                const t = setTimeout(() => {
                    if (!gameState.gameActive) return;
                    flipped.forEach(c => { c.matched = true; c.flipped = false; });
                    matches++;

                    if (matches === 6) {
                        if (timerInterval) clearInterval(timerInterval);
                        const elapsed = Math.floor((Date.now() - startTime) / 1000);
                        const timeBonus = Math.max(60 - elapsed, 0);
                        const attemptBonus = Math.max((14 - attempts) * 5, 0);
                        const score = 100 + timeBonus + attemptBonus;

                        render();
                        showGameOver({
                            title: '🧠 Memory Master!',
                            emoji: '🏆',
                            xp: score,
                            isWin: true,
                            onRestart: startMemoryGame
                        });
                        return;
                    }

                    flipped = [];
                    locked = false;
                    render();
                }, 500);
                gameState.timers.push(t);
            } else {
                const t = setTimeout(() => {
                    if (!gameState.gameActive) return;
                    flipped.forEach(c => c.flipped = false);
                    flipped = [];
                    locked = false;
                    render();
                }, 900);
                gameState.timers.push(t);
            }
        }
    }

    render();
}

// ===================== K8s GAME (FIXED) =====================
function startK8sGame() {
    cleanupGame();
    
    if (!gameArea || !modalContent) return;
    
    gameState.currentGame = 'k8s';
    gameState.gameActive = true;
    modalContent.style.borderColor = '#8b5cf6';

    const nodes = [
        { name: 'Master',   health: 100 },
        { name: 'Worker-1', health: 60  },
        { name: 'Worker-2', health: 35  },
        { name: 'Worker-3', health: 80  },
        { name: 'GPU',      health: 45  },
        { name: 'Storage',  health: 90  }
    ];

    let healsLeft = 12;
    let gameWon = false;

    function getStatus(h) {
        if (h >= 80) return 'healthy';
        if (h >= 50) return 'warning';
        return 'critical';
    }

    function getAvgHealth() {
        return Math.round(nodes.reduce((s, n) => s + n.health, 0) / nodes.length);
    }

    function checkVictory() {
        const avg = getAvgHealth();
        if (avg >= 85 && !gameWon) {
            gameWon = true;
            const score = 150 + healsLeft * 10;
            render();
            showGameOver({
                title: '⚛️ Cluster Rescued!',
                emoji: '✅',
                xp: score,
                isWin: true,
                onRestart: startK8sGame
            });
            return true;
        }
        if (healsLeft <= 0 && avg < 85 && !gameWon) {
            gameWon = true;
            render();
            showGameOver({
                title: 'Cluster Failed',
                emoji: '💀',
                xp: 0,
                isWin: false,
                onRestart: startK8sGame
            });
            return true;
        }
        return false;
    }

    function render() {
        const avg = getAvgHealth();
        let html = `
            <div style="margin-bottom:15px; text-align:center;">
                <div class="heal-count">🩹 Heals Left: ${healsLeft}</div>
                <div class="heal-count">💊 Cluster Health: ${avg}% ${avg >= 85 ? '✅' : '(need 85%)'}</div>
            </div>
            <div class="k8s-board">
        `;
        nodes.forEach((node, i) => {
            const status = getStatus(node.health);
            const icon = node.health >= 80 ? '✅' : node.health >= 50 ? '⚠️' : '💀';
            const disabled = !gameState.gameActive || node.health >= 100 || healsLeft <= 0 || gameWon;
            html += `
                <div class="k8s-node ${status}">
                    <div style="font-size:2rem;">${icon}</div>
                    <h3 style="color:white; margin:5px 0;">${node.name}</h3>
                    <div class="health-bar">
                        <div class="health-fill" style="width:${node.health}%"></div>
                    </div>
                    <div style="color:#94a3b8; margin:5px 0; font-size:0.9rem;">Health: ${node.health}%</div>
                    <button class="game-btn" data-node="${i}"
                            style="margin-top:5px; padding:8px 15px; font-size:0.8rem;"
                            ${disabled ? 'disabled' : ''}>
                        🩹 HEAL +20
                    </button>
                </div>
            `;
        });
        html += '</div>';
        
        if (gameArea) gameArea.innerHTML = html;

        gameArea.querySelectorAll('[data-node]').forEach(btn => {
            addTrackedEventListener(btn, 'click', () => {
                const idx = parseInt(btn.dataset.node);
                if (!gameState.gameActive || healsLeft <= 0 || gameWon) return;
                if (nodes[idx].health >= 100) { showToast('Node already at 100%!'); return; }
                nodes[idx].health = Math.min(100, nodes[idx].health + 20);
                healsLeft--;
                if (!checkVictory()) render();
            });
        });
    }

    render();
}

// ===================== DOCKER GAME (FIXED) =====================
function startDockerGame() {
    cleanupGame();
    
    if (!gameArea || !modalContent) return;
    
    gameState.currentGame = 'docker';
    gameState.gameActive = true;
    modalContent.style.borderColor = '#10b981';

    const layers = [
        { cmd: 'FROM ubuntu:22.04',           size: 72,  type: 'base' },
        { cmd: 'RUN apt-get update',           size: 15,  type: 'run'  },
        { cmd: 'RUN apt-get install -y python3', size: 85, type: 'run'  },
        { cmd: 'RUN pip3 install flask',        size: 45,  type: 'run'  },
        { cmd: 'COPY . /app',                  size: 2,   type: 'copy' },
        { cmd: 'CMD ["python3", "app.py"]',    size: 0,   type: 'cmd'  }
    ];

    let merged = new Array(layers.length).fill(false);
    let mergesDone = 0;
    const WIN_MERGES = 2;

    function render() {
        const savedMB = merged.reduce((s, m, i) => m ? s + layers[i].size : s, 0);

        let html = `
            <div class="docker-hint">
                💡 Click adjacent <strong style="color:#10b981;">RUN</strong> layers to merge them and reduce image size.
                Merges needed: <strong style="color:#fbbf24;">${WIN_MERGES - mergesDone}</strong> more
                ${savedMB > 0 ? `| 💾 Saved: <strong style="color:#10b981;">${savedMB}MB</strong>` : ''}
            </div>
            <div class="docker-board">
        `;

        for (let i = 0; i < layers.length; i++) {
            if (merged[i]) continue;
            
            const l = layers[i];
            const isRun = l.type === 'run';
            
            let nextIdx = -1;
            for (let j = i + 1; j < layers.length; j++) {
                if (!merged[j]) { nextIdx = j; break; }
            }
            const nextIsRun = nextIdx !== -1 && layers[nextIdx] && layers[nextIdx].type === 'run';
            const canMerge = isRun && nextIsRun;

            const typeColors = { base: '#f59e0b', run: '#10b981', copy: '#3b82f6', cmd: '#8b5cf6' };
            const color = typeColors[l.type] || '#94a3b8';

            html += `
                <div class="docker-layer ${!canMerge && l.type !== 'run' ? 'non-mergeable' : ''}"
                     data-idx="${i}" style="border-color: ${color}; cursor: ${canMerge ? 'pointer' : 'default'}">
                    <span style="font-size:1.8rem;">${l.type === 'base' ? '🐧' : l.type === 'run' ? '⚙️' : l.type === 'copy' ? '📁' : '🖥️'}</span>
                    <div style="flex:1; color: white;">
                        <span style="background:${color}; padding:2px 8px; border-radius:10px; font-size:0.75rem; font-weight:700; margin-right:8px; color:black;">${l.type.toUpperCase()}</span>
                        ${l.cmd}
                    </div>
                    ${l.size > 0 ? `<span class="layer-size" style="border-color:${color}; color:${color};">${l.size}MB</span>` : ''}
                    ${canMerge ? '<span style="color:#10b981; font-size:0.8rem; white-space:nowrap;">🔗 Click to merge ↓</span>' : ''}
                </div>
            `;
        }

        html += '</div>';
        
        if (gameArea) gameArea.innerHTML = html;

        gameArea.querySelectorAll('.docker-layer[data-idx]').forEach(el => {
            addTrackedEventListener(el, 'click', () => {
                if (!gameState.gameActive) return;
                const i = parseInt(el.dataset.idx);
                if (layers[i].type !== 'run') {
                    showToast('❌ Only RUN commands can be merged!');
                    return;
                }
                
                let nextIdx = -1;
                for (let j = i + 1; j < layers.length; j++) {
                    if (!merged[j]) { nextIdx = j; break; }
                }
                
                if (nextIdx === -1 || !layers[nextIdx] || layers[nextIdx].type !== 'run') {
                    showToast('❌ No adjacent RUN layer to merge with!');
                    return;
                }

                merged[i] = true;
                layers[nextIdx].size += layers[i].size;
                layers[nextIdx].cmd = layers[i].cmd.replace(/^RUN\s+/, '') + ' && \\\n    ' + layers[nextIdx].cmd.replace(/^RUN\s+/, '');
                layers[nextIdx].cmd = 'RUN ' + layers[nextIdx].cmd.replace(/^RUN\s+/, '');
                mergesDone++;

                showToast(`✅ Layers merged! (${mergesDone}/${WIN_MERGES})`);

                if (mergesDone >= WIN_MERGES) {
                    gameState.gameActive = false;
                    const score = 150 + (layers.filter((_, i) => !merged[i]).length) * 10;
                    render();
                    showGameOver({
                        title: '🐳 Docker Master!',
                        emoji: '🏆',
                        xp: score,
                        isWin: true,
                        onRestart: startDockerGame
                    });
                } else {
                    render();
                }
            });
        });
    }

    render();
}

// ===================== AWS GAME (FIXED) =====================
function startAWSGame() {
    cleanupGame();
    
    if (!gameArea || !modalContent) return;
    
    gameState.currentGame = 'aws';
    gameState.gameActive = true;
    modalContent.style.borderColor = '#f59e0b';

    const regions = [
        { name: 'US-East-1',  icon: '🇺🇸', current: 3, target: 8 },
        { name: 'EU-West-1',  icon: '🇪🇺', current: 2, target: 6 },
        { name: 'AP-South-1', icon: '🌏', current: 4, target: 7 },
        { name: 'SA-East-1',  icon: '🌎', current: 1, target: 5 }
    ];

    let actionsLeft = 20;
    let gameWon = false;

    function calculateBalance() {
        const total = regions.reduce((s, r) => s + (r.current / r.target) * 100, 0);
        return Math.round(total / regions.length);
    }

    function checkVictory() {
        const balance = calculateBalance();
        if (balance >= 90 && !gameWon) {
            gameWon = true;
            const score = 200 + actionsLeft * 5;
            render();
            showGameOver({
                title: '☁️ AWS Master!',
                emoji: '🏆',
                xp: score,
                isWin: true,
                onRestart: startAWSGame
            });
            return true;
        }
        if (actionsLeft <= 0 && balance < 90 && !gameWon) {
            gameWon = true;
            render();
            showGameOver({
                title: 'Out of Actions!',
                emoji: '💸',
                xp: 0,
                isWin: false,
                onRestart: startAWSGame
            });
            return true;
        }
        return false;
    }

    function render() {
        const balance = calculateBalance();
        const barColor = balance >= 90 ? '#10b981' : balance >= 60 ? '#f59e0b' : '#ef4444';
        let html = `
            <div style="margin-bottom:15px; text-align:center;">
                <div class="actions-left">⚡ Actions Left: ${actionsLeft}</div>
                <div class="actions-left" style="color:${barColor}">📊 Balance: ${balance}% ${balance >= 90 ? '✅' : '(need 90%)'}</div>
                <div style="width:100%; height:10px; background:#1a2639; border-radius:6px; margin:10px auto; max-width:400px; overflow:hidden; border:1px solid #3b4a5f;">
                    <div style="height:100%; width:${balance}%; background:${barColor}; transition:width 0.3s; border-radius:6px;"></div>
                </div>
            </div>
            <div class="aws-board">
        `;

        regions.forEach((region, i) => {
            const percent = Math.round((region.current / region.target) * 100);
            const canUp   = region.current < region.target;
            const canDown = region.current > 0;
            html += `
                <div class="aws-region">
                    <div style="font-size:2rem;">${region.icon}</div>
                    <h3 style="color:white; margin:5px 0;">${region.name}</h3>
                    <div class="instance-count">${region.current}<span style="font-size:1rem; color:#94a3b8;">/${region.target}</span></div>
                    <div class="instance-bar">
                        <div class="bar-fill" style="width:${percent}%"></div>
                    </div>
                    <div style="color:#94a3b8; font-size:0.85rem; margin:5px 0;">${percent}% of target</div>
                    <div style="display:flex; gap:10px; justify-content:center; margin-top:10px;">
                        <button class="game-btn" data-region="${i}" data-dir="up"
                                style="padding:6px 14px; font-size:0.85rem;"
                                ${!gameState.gameActive || actionsLeft <= 0 || !canUp || gameWon ? 'disabled' : ''}>
                            ➕ UP
                        </button>
                        <button class="game-btn" data-region="${i}" data-dir="down"
                                style="padding:6px 14px; font-size:0.85rem; background:#ef4444;"
                                ${!gameState.gameActive || actionsLeft <= 0 || !canDown || gameWon ? 'disabled' : ''}>
                            ➖ DOWN
                        </button>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        
        if (gameArea) gameArea.innerHTML = html;

        gameArea.querySelectorAll('[data-region]').forEach(btn => {
            addTrackedEventListener(btn, 'click', () => {
                if (!gameState.gameActive || actionsLeft <= 0 || gameWon) return;
                const i = parseInt(btn.dataset.region);
                const dir = btn.dataset.dir;
                if (dir === 'up' && regions[i].current < regions[i].target) {
                    regions[i].current++;
                    actionsLeft--;
                } else if (dir === 'down' && regions[i].current > 0) {
                    regions[i].current--;
                    actionsLeft--;
                }
                if (!checkVictory()) render();
            });
        });
    }

    render();
}

// ===================== EVENT LISTENERS (FIXED) =====================
document.querySelectorAll('.game-card').forEach(card => {
    card.addEventListener('click', (e) => {
        // Check if click is on play button or card
        const isPlayButton = e.target.classList.contains('game-btn') || e.target.closest('.game-btn');
        if (!isPlayButton) return;
        
        const game = card.dataset.game;
        
        // Close any existing game first
        closeGame();
        
        // Small delay to ensure cleanup is complete
        setTimeout(() => {
            if (gameModal) gameModal.classList.add('active');
            showLoader(true);

            setTimeout(() => {
                showLoader(false);
                try {
                    if (game === 'racer') startRacerGame();
                    else if (game === 'memory') startMemoryGame();
                    else if (game === 'k8s') startK8sGame();
                    else if (game === 'docker') startDockerGame();
                    else if (game === 'aws') startAWSGame();
                } catch (error) {
                    console.error('Game start error:', error);
                    showToast('Error starting game. Please try again.');
                    closeGame();
                }
            }, 300);
        }, 50);
    });
});

// Close modal on backdrop click
if (gameModal) {
    gameModal.addEventListener('click', (e) => {
        if (e.target === gameModal) closeGame();
    });
}

// Prevent scroll during racer
document.addEventListener('touchmove', (e) => {
    if (gameModal && gameModal.classList.contains('active') && gameState.currentGame === 'racer') {
        e.preventDefault();
    }
}, { passive: false });

// Init
updateScore();