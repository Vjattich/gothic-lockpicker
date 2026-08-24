'use strict';
const UI_CLASSES = {
    TOUCHED: 'touched',
    SELECTED: 'selected',
    LINKED: 'linked',
    RINKED: 'rinked',
    GLOW: 'glow-white',
    ACTIVE_STEP: 'active-step',
    SHOW_STRETCH: 'show-stretch',
    EXPANDED: 'is-expanded',
    EXPANDED_PARENT: 'is-expanded-parent',
    PRESSING: 'is-pressing',
    DISABLED_BTN: 'disabled-btn',
    INSPECT_BTN: 'inspect-btn',
    PLATE: 'plate',
    HOLE: 'hole',
    ZOOMING: 'is-zooming',
    DRAGGING: 'is-dragging',
    ORBITING: 'is-orbiting'
};

const ACTIONS = {
    DESELECT: 'deselect',
    DESELECT_DRAG_END: 'deselectDragEnd',
    DRAG_START: 'handleDragStart',
    DRAG_MOVE: 'handleDragMove',
    DRAG_END: 'handleDragEnd'
};

const
    lock = document.getElementById('lock'),
    controls = document.getElementById('controls'),
    sizeInput = document.getElementById('sizeInput'),
    countInput = document.getElementById('countInput'),
    btnDecrease = document.getElementById('btnDecreaseBlocks'),
    btnIncrease = document.getElementById('btnIncreaseBlocks'),
    inspectorRow = document.getElementById('inspectorRow'),
    resetBtn = document.getElementById('resetBtn'),
    solveBtn = document.getElementById('solveBtn'),
    shareBtn = document.getElementById('shareBtn'),
    steamGuideBtn = document.getElementById('steamGuideBtn'),
    prevBtn = document.getElementById('prevBtn'),
    nextBtn = document.getElementById('nextBtn'),
    playBtn = document.getElementById('playBtn'),
    restartSeqBtn = document.getElementById('restartSeqBtn'),
    stepControlsRow = document.getElementById('stepControlsRow'),
    squashLabel = document.getElementById('squashLabel'),
    squashMovesCheck = document.getElementById('squashMovesCheck'),
    statusMsg = document.getElementById('statusMsg'),
    solutionList = document.getElementById('solutionList'),
    expandBtn = document.getElementById('expandBtn'),
    searchToggle = document.getElementById('searchToggle'),
    searchPanel = document.getElementById('searchPanel'),
    searchCloseBtn = document.getElementById('searchClose'),
    matchCountText = document.getElementById('matchCountText'),
    searchEmpty = document.getElementById('searchEmpty'),
    searchList = document.getElementById('searchList');

const
    PIN_RAISED = -10,
    PIN_MIDDLE = -5,
    PIN_UNDER = 1,
    LONG_PRESS_DURATION = 500,
    HOLD_STEP_DURATION = 600,
    PRESS_ANIM_DELAY = 150,
    SHORT_PRESS_DURATION = 100,
    DRAG_THRESHOLD = 5,
    HOLE_SPACING = 36.5,
    MAX_BOUND = 3 * HOLE_SPACING,
    MAX_DELTA_LIMIT = 120,
    SOLVE_TIMEOUT_MS = 5000,
    MAX_PLATES = 8,
    ONE_OVER_HOLE_SPACING = 1 / HOLE_SPACING,
    SETUP_ANIMATION_MS = 350,
    PLATE_TEMPLATE = document.createElement('template');

/* 2. Plate template -------------------------------------------------------- */

(() => {
    const renderPinBody = () => {
        let sidesHtml = '';
        for (let s = 0; s < 16; s++) {
            sidesHtml += `<div class="pin-side" style="transform: rotateZ(${s * 22.5}deg) translateY(-6px) rotateX(90deg)"></div>`;
        }
        return `<div class="pin-body">${sidesHtml}<div></div></div>`;
    };

    let holesHtml = '';
    for (let h = 0; h < 7; h++) {
        if (3 === h) {
            holesHtml += `<div class="hole pin-hole ${h}"><div class="pin-wrapper"><div class="pin pin-visible pin-body-visible" style="transform: translateZ(${PIN_RAISED}px)">${renderPinBody()}<div class="pin-cap"></div></div></div></div>`;
        } else {
            holesHtml += `<div class="hole ${h}"></div>`;
        }
    }

    let tubeHtml = '';
    const corners = [
        {class: 'tube-tr', startAngle: 0, y: '-29.5px'},
        {class: 'tube-br', startAngle: 90, y: '-29.5px'},
        {class: 'tube-bl', startAngle: 180, y: '-29px'},
        {class: 'tube-tl', startAngle: 270, y: '-29px'}
    ];

    for (const corner of corners) {
        tubeHtml += `<div class="corner-tube ${corner.class}">`;
        for (let a = 7.5; a < 90; a += 15) {
            tubeHtml += `<div class="tube-panel" style="transform: rotateZ(${corner.startAngle + a}deg) translateY(${corner.y}) rotateX(-90deg)"></div>`;
        }
        tubeHtml += '</div>';
    }

    PLATE_TEMPLATE.innerHTML = `<div class="plate glow"><div class="front-face"></div><div class="top-face">${holesHtml}</div><div class="right-face"></div><div class="bottom-face"></div><div class="left-face"></div>${tubeHtml}</div>`;
})();

/* 3. Game state -------------------------------------------------------------- */

const gameState = {
    isInteracted: false,
    isSolving: false,
    isRender: false,
    blocks: [],
    activeLinkerId: null,
    dragState: {
        activePlate: null,
        startInputX: 0,
        movingGroup: [],
        isDragging: false,
        longPressTimer: null,
        hasMoved: false,
        rafId: null,
        currentClientX: 0
    },
    isMobile: false,
    lastTouchTime: 0,
    lastAction: null,
    isHovering: false,
    hoveredElements: [],
    glowingHoles: []
};

const pinchState = {initialDistance: 0, initialScale: 0, lastScale: 0};

const playback = {
    isSolving: false,
    solution: null,
    stepIndex: 0,
    isPlaying: false,
    moveMap: [],
    initialSetup: null,
    lastActiveStepEl: null
};

let isGuideActive = false,
    tutorialSearchDemo = false;

function setInitialState() {
    gameState.isMobile = 768 >= window.innerWidth;
    pinchState.initialScale = gameState.isMobile
        ? Math.max(0.3, Math.min((window.innerWidth - 140) / 340, 1))
        : 1.4;
    pinchState.lastScale = pinchState.initialScale;
    sizeInput.value = pinchState.initialScale;
    document.documentElement.style.setProperty('--block-scale', pinchState.initialScale);
}

setInitialState();

if (gameState.isMobile) squashMovesCheck.checked = false;

// Debounced resize
let resizeTimer = null;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        const wasMobile = gameState.isMobile;
        setInitialState();
        if (wasMobile !== gameState.isMobile) renderBlocks();
        sizeSearchPanel();
    }, 150);
});

function clearPlateStateClasses() {
    gameState.blocks.forEach(b => b.el.classList.remove(
        UI_CLASSES.TOUCHED, UI_CLASSES.SELECTED, UI_CLASSES.LINKED, UI_CLASSES.RINKED
    ));
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function getClientX(e) {
    return e.touches && e.touches.length > 0 ? e.touches[0].clientX : e.clientX;
}

function getClientY(e) {
    return e.touches && e.touches.length > 0 ? e.touches[0].clientY : e.clientY;
}

function vibrate(duration) {
    if (!gameState.isInteracted) return;

    if (navigator.vibrate) navigator.vibrate(duration);

    if (!navigator.getGamepads) return;
    for (const gamepad of navigator.getGamepads()) {
        if (gamepad && gamepad.vibrationActuator && typeof gamepad.vibrationActuator.playEffect === 'function') {
            gamepad.vibrationActuator.playEffect('dual-rumble', {
                startDelay: 0,
                duration: duration * 4,
                weakMagnitude: 1.0,
                strongMagnitude: 0.0
            }).catch(() => {});
            break;
        }
    }
}

/* 4. Search panel (matching saved locks) -------------------------------------- */

function sizeSearchPanel() {
    if (!searchPanel.classList.contains('is-open')) return;
    if (gameState.isMobile) {
        searchPanel.style.height = ''; // mobile: bottom sheet height comes from CSS
        return;
    }
    const
        rect = searchPanel.getBoundingClientRect(),
        bottomPadding = window.innerHeight * 0.05,
        availableHeight = window.innerHeight - rect.top - bottomPadding;
    searchPanel.style.height = `${Math.max(availableHeight, 200)}px`;
}

function setSearchOpen(open) {
    searchPanel.classList.toggle('is-open', open);
    searchToggle.classList.toggle('is-open', open);
    searchToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
        refreshMatches();
        sizeSearchPanel();
    } else {
        searchPanel.style.height = '';
    }
}

function toggleSearchOpen() {
    setSearchOpen(!searchPanel.classList.contains('is-open'));
}

searchToggle.addEventListener('click', toggleSearchOpen);
searchToggle.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleSearchOpen();
    }
});
searchCloseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setSearchOpen(false);
});


function updateMatchCount(matches) {
    if (isGuideActive && !tutorialSearchDemo) {
        return;
    }
    const n = matches.length;
    matchCountText.textContent = n + (1 === n ? ' lock' : ' locks');
    searchToggle.classList.toggle('has-matches', n > 0);
    searchEmpty.style.display = n > 0 ? 'none' : 'block';
}

function currentPosString() {
    return gameState.blocks.map(b => Math.round(b.x / HOLE_SPACING));
}

function currentLinksString(blocks = gameState.blocks) {
    const parts = [];
    for (const b of blocks) {
        const targets = Object.keys(b.group)
            .map(Number)
            .filter(t => t !== b.id)
            .sort((a, z) => a - z);
        for (const t of targets) parts.push(`${b.id}>${t}:${b.group[t]}`);
    }
    return parts.join(';');
}

function getCatalogueMatches(catalogue) {
    const source = catalogue
        || ('undefined' !== typeof LOCK_CATALOGUE ? LOCK_CATALOGUE : []);

    let candidates = source.filter(e => e.n === gameState.blocks.length);
    if (0 === candidates.length) return candidates;

    const currentPositioning = currentPosString();

    candidates = candidates.filter(e => {
        const entry = e.pos.split(',');

        let seems = true,
            isAllZero = true;
        for (let i = 0; i < currentPositioning.length; i++) {
            const pos = currentPositioning[i];

            if (0 === pos) {
                if (currentPositioning.length - 1 === pos && isAllZero) {
                    seems = false;
                }
                continue;
            }

            seems = seems && pos === +entry[i];
            isAllZero = isAllZero && pos !== +entry[i];
        }

        return seems;
    });

    const links = currentLinksString();
    if (!links) return candidates;

    return candidates.filter(e => e.links === links);
}

let lastMatches = [];

function refreshMatches() {

    if (gameState.isSolving) {
        return;
    }

    const matches = getCatalogueMatches();
    updateMatchCount(matches);
    renderSearchList(matches);
}

let matchRefreshTimer = null;

function scheduleMatchRefresh() {
    clearTimeout(matchRefreshTimer);
    matchRefreshTimer = setTimeout(refreshMatches, 120);
}

function decodeTitle(title) {
    try {
        return decodeURIComponent(title);
    } catch (e) {
        return title;
    }
}

function renderSearchList(matches) {
    lastMatches = matches;
    const fragment = document.createDocumentFragment();
    for (const entry of matches) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'search-item';
        item.dataset.id = entry.id;
        item.textContent = decodeTitle(entry.title);
        fragment.appendChild(item);
    }
    searchList.replaceChildren(fragment);
}

searchList.addEventListener('click', (e) => {
    const item = e.target.closest('.search-item');
    if (!item) return;
    const entry = lastMatches.find(m => String(m.id) === item.dataset.id);
    if (entry) loadCatalogueLock(entry);
});

function loadCatalogueLock(entry) {
    const setup = decodeSetup(entry.state);
    if (!setup) {
        console.error('Bad catalogue state for lock #' + entry.id);
        return;
    }

    setSearchOpen(false);
    applySetup(setup, true);
    scheduleMatchRefresh();
    solveBtn.click();
}

/* 5. Setup encode / decode / share --------------------------------------------- */

/** Snapshot of the board: block count, positions (hole units), link matrix. */
function compactSetup() {
    const
        n = gameState.blocks.length,
        start = gameState.blocks.map(b => Math.round(b.x / HOLE_SPACING)),
        effects = [];
    for (let i = 0; i < n; i++) {
        const row = [];
        for (let j = 0; j < n; j++) {
            row.push(gameState.blocks[i].group[j + 1] || 0);
        }
        effects.push(row);
    }
    return {n, start, effects};
}

function decodeSetup(encoded) {
    try {
        const setup = JSON.parse(atob(encoded));
        if (!setup || !setup.n || !setup.start || !setup.effects) return null;
        return setup;
    } catch (e) {
        return null;
    }
}

function applySetup(setup, animate = false) {
    gameState.isRender = true;
    try {
        countInput.value = setup.n;
        gameState.activeLinkerId = null;

        if (animate && gameState.blocks.length === setup.n) {
            // Keep existing plates so they can slide from the current state
            clearPlateStateClasses();
        } else {
            animate = false;
            gameState.blocks = [];
            renderBlocks();
        }

        for (let i = 0; i < setup.n; i++) {
            const
                b = gameState.blocks[i],
                targetX = setup.start[i] * HOLE_SPACING;

            b.group = {};
            setup.effects[i].forEach((rel, j) => {
                if (0 !== rel) b.group[j + 1] = rel;
            });

            if (animate && b.x !== targetX) {
                updateBlockState(b, {
                    x: targetX,
                    transition: `transform ${SETUP_ANIMATION_MS / 1000}s ease-out`,
                    pinTime: SETUP_ANIMATION_MS
                });
            } else {
                updateBlockState(b, {x: targetX});
            }
        }

        renderInspectorRow();
    } finally {
        gameState.isRender = false;
    }
}

function loadFromURL() {
    const stateParam = new URLSearchParams(window.location.search).get('state');
    if (!stateParam) return false;

    const setup = decodeSetup(stateParam);
    if (!setup) {
        console.error('Failed to load shared state.');
        return false;
    }

    applySetup(setup);

    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete('state');
    window.history.replaceState({}, document.title, cleanUrl.toString());
    solveBtn.click();
    return true;
}

let shareStatusTimeout;

shareBtn.addEventListener('click', () => {
    const
        value = playback.initialSetup || compactSetup(),
        url = new URL(window.location.href);

    url.searchParams.set('state', btoa(JSON.stringify(value)));

    navigator.clipboard.writeText(url.toString()).then(() => {

        const message = 'Copied to clipboard!',
            idx =statusMsg.className.lastIndexOf('-') + 1,
            prevMessage = statusMsg.textContent,
            prevMessageType =  statusMsg.className.substring(idx, statusMsg.className.length)

        setStatus(message, 'success');
        clearTimeout(shareStatusTimeout);
        shareStatusTimeout = setTimeout(() => {
            if (message === statusMsg.textContent) {
                setStatus(prevMessage, prevMessageType);
            }
        }, 1500);
    }).catch(() => {
        setStatus('Failed to copy link.', 'error');
    });
});

/* 6. Solver integration & playback ---------------------------------------------- */

function setStatus(text, type = 'info') {
    statusMsg.textContent = text;
    statusMsg.className = `status-message status-${type}`;
    statusMsg.closest('.play-status-row').classList.toggle(UI_CLASSES.SHOW_STRETCH, '' !== text);
}

function solveInWorker() {
    if (undefined === window.Worker) return Promise.reject(new Error('Web Workers are not supported.'));
    const setup = compactSetup();
    return new Promise((resolve, reject) => {
        const worker = new Worker('solver.js');
        const hardTimeout = setTimeout(() => {
            worker.terminate();
            resolve({timeout: true});
        }, SOLVE_TIMEOUT_MS + 1000);
        worker.onmessage = (event) => {
            clearTimeout(hardTimeout);
            worker.terminate();
            if (event.data?.error) {
                reject(new Error(event.data.error));
            } else {
                resolve(event.data);
            }
        };
        worker.onerror = (error) => {
            clearTimeout(hardTimeout);
            worker.terminate();
            reject(error);
        };
        worker.postMessage({
            n: setup.n,
            start: setup.start,
            effects: setup.effects,
            mode: 'fewer-switches-fast',
            timeoutMs: SOLVE_TIMEOUT_MS
        });
    });
}

function clearSolutionUI() {
    gameState.isSolving = false;
    playback.solution = null;
    playback.stepIndex = 0;
    playback.isPlaying = false;
    playback.initialSetup = null;
    playBtn.style.display = 'none';
    playBtn.textContent = '▶ Play';
    restartSeqBtn.style.display = 'none';
    stepControlsRow.classList.remove(UI_CLASSES.SHOW_STRETCH);
    squashLabel.classList.remove(UI_CLASSES.SHOW_STRETCH);
    setStatus('', 'info');
    solveBtn.disabled = false;

    clearPlateStateClasses();

    gameState.glowingHoles.forEach(h => {
        clearTimeout(h.glowTimeoutId);
        h.glowTimeoutId = null;
        h.classList.remove(UI_CLASSES.GLOW);
    });
    gameState.glowingHoles = [];

    solutionList.innerHTML = '';
    playback.lastActiveStepEl = null;
    if (solutionList.classList.contains(UI_CLASSES.EXPANDED)) toggleExpandList(false);
}

solveBtn.addEventListener('click', async () => {
    const setup = compactSetup();
    if (setup.start.every(v => v === 0)) {
        clearSolutionUI();
        return;
    }
    clearSolutionUI();
    playback.initialSetup = setup;
    solveBtn.textContent = 'Solving...';
    solveBtn.disabled = true;
    setStatus('Calculating solution...', 'info');
    try {
        const result = await solveInWorker();
        if (result.timeout) {
            setStatus('Solver timed out!', 'error');
        } else if (!result || !result.moves) {
            setStatus('No solution found', 'error');
        } else if (0 === result.moves.length) {
            setStatus('', 'info');
        } else {
            //do it zero while have solve
            updateMatchCount([]);
            playback.solution = result.moves;
            playback.stepIndex = 0;
            gameState.isSolving = true;
            setStatus(`${result.moves.length} moves!`, 'success');
            playBtn.style.display = 'block';
            restartSeqBtn.style.display = 'block';
            stepControlsRow.classList.add(UI_CLASSES.SHOW_STRETCH);
            squashLabel.classList.add(UI_CLASSES.SHOW_STRETCH);
            renderSolutionList();
        }
    } catch (error) {
        setStatus('Solver crashed: ' + error.message, 'error');
    } finally {
        solveBtn.textContent = 'Solve Lock';
        if (!playback.isPlaying) solveBtn.disabled = false;
    }
});

function applySingleMove(move, reverse = false) {
    const
        primaryBlock = gameState.blocks[move.plate - 1],
        stepShift = ('left' === move.direction) === reverse ? HOLE_SPACING : -HOLE_SPACING;

    Object.keys(primaryBlock.group).forEach(i => {
        const
            id = +i,
            relativeDir = primaryBlock.group[id],
            b = gameState.blocks[id - 1];
        if (!b) return;
        updateBlockState(b, {
            x: Math.max(-MAX_BOUND, Math.min(MAX_BOUND, b.x + stepShift * relativeDir)),
            transition: 'transform 0.2s ease-out',
            pinTime: 200
        });
    });
}

function jumpToStep(targetIndex) {
    targetIndex = targetIndex - 1;
    if (null === playback.solution || playback.isPlaying) return;

    const targetX = gameState.blocks.map(b => b.x);

    const simulate = (move, reverse) => {
        const
            primaryBlock = gameState.blocks[move.plate - 1],
            stepShift = ('left' === move.direction) === reverse ? HOLE_SPACING : -HOLE_SPACING;
        for (const i in primaryBlock.group) {
            const id = +i;
            if (!gameState.blocks[id - 1]) continue;
            targetX[id - 1] = Math.max(-MAX_BOUND, Math.min(MAX_BOUND, targetX[id - 1] + stepShift * primaryBlock.group[id]));
        }
    };

    while (playback.stepIndex < targetIndex) {
        simulate(playback.solution[playback.stepIndex], false);
        playback.stepIndex++;
    }
    while (playback.stepIndex > targetIndex) {
        simulate(playback.solution[playback.stepIndex - 1], true);
        playback.stepIndex--;
    }

    gameState.blocks.forEach((b, i) => {
        if (b.x === targetX[i]) return;
        updateBlockState(b, {x: targetX[i], transition: 'transform 0.2s ease-out', pinTime: 200});
    });

    updatePlaybackUI();
}

function getNextSquashedIndex() {
    if (null === playback.solution || playback.stepIndex >= playback.solution.length) return playback.stepIndex;
    const currentMove = playback.solution[playback.stepIndex];
    let nextIdx = playback.stepIndex + 1;
    while (nextIdx < playback.solution.length) {
        const move = playback.solution[nextIdx];
        if (move.plate !== currentMove.plate || move.direction !== currentMove.direction) break;
        nextIdx++;
    }
    return nextIdx + 1;
}

function getPrevSquashedIndex() {
    if (null === playback.solution || playback.stepIndex <= 0) return playback.stepIndex;
    const currentMove = playback.solution[playback.stepIndex - 1];
    let prevIdx = playback.stepIndex - 1;
    while (prevIdx > 0) {
        const move = playback.solution[prevIdx - 1];
        if (move.plate !== currentMove.plate || move.direction !== currentMove.direction) break;
        prevIdx--;
    }
    return prevIdx + 1;
}

function stepForward(forceSquash = false) {
    if (null === playback.solution || playback.isPlaying || playback.stepIndex >= playback.solution.length) return;
    if (squashMovesCheck.checked || forceSquash) {
        jumpToStep(getNextSquashedIndex());
    } else {
        applySingleMove(playback.solution[playback.stepIndex], false);
        playback.stepIndex++;
        updatePlaybackUI();
    }
}

function stepBackward(forceSquash = false) {
    if (null === playback.solution || playback.isPlaying || playback.stepIndex <= 0) return;
    if (!gameState.isSolving) {
        gameState.isSolving = true;
        updateMatchCount([]);
    }
    if (squashMovesCheck.checked || forceSquash) {
        jumpToStep(getPrevSquashedIndex());
    } else {
        playback.stepIndex--;
        applySingleMove(playback.solution[playback.stepIndex], true);
        updatePlaybackUI();
    }
}

playBtn.addEventListener('click', async () => {
    if (null === playback.solution || playback.stepIndex >= playback.solution.length) return;
    if (playback.isPlaying) {
        playback.isPlaying = false;
        playBtn.textContent = '▶ Play';
        setStatus('Paused sequence.', 'info');
        return;
    }
    playback.isPlaying = true;
    playBtn.textContent = '⏸ Pause';
    setStatus('Playing sequence...', 'info');
    updatePlaybackUI();
    while (playback.stepIndex < playback.solution.length && playback.isPlaying) {
        applySingleMove(playback.solution[playback.stepIndex], false);
        playback.stepIndex++;
        updatePlaybackUI();
        await sleep(300);
    }
    playback.isPlaying = false;
    if (playback.stepIndex >= playback.solution.length) {
        playBtn.textContent = '▶ Play';
        setStatus('Sequence complete!', 'success');
    }
    updatePlaybackUI();
});

restartSeqBtn.addEventListener('click', () => {
    if (null === playback.solution || playback.isPlaying) return;
    gameState.isSolving = true;
    updateMatchCount([]);
    setStatus('Restarting sequence...', 'info');
    while (playback.stepIndex > 0) {
        applySingleMove(playback.solution[playback.stepIndex - 1], true);
        playback.stepIndex--;
    }
    playBtn.textContent = '▶ Play';
    setStatus(`${playback.solution.length} moves!`, 'success');
    updatePlaybackUI();
});

/* 7. Solution list rendering ----------------------------------------------------- */

function setActiveStep(el) {
    if (playback.lastActiveStepEl === el) return;
    if (playback.lastActiveStepEl) playback.lastActiveStepEl.classList.remove(UI_CLASSES.ACTIVE_STEP);
    if (el) el.classList.add(UI_CLASSES.ACTIVE_STEP);
    playback.lastActiveStepEl = el;
}

function scheduleGlowFadeOut(hole) {
    if (hole.glowTimeoutId) return;
    hole.glowTimeoutId = setTimeout(() => {
        hole.classList.remove(UI_CLASSES.GLOW);
        hole.glowTimeoutId = null;
        gameState.glowingHoles = gameState.glowingHoles.filter(h => h !== hole);
    }, 250);
}

function updatePlaybackUI() {
    if (null === playback.solution) return;

    const isLastMove = playback.stepIndex === playback.solution.length;
    gameState.isSolving = !isLastMove;
    nextBtn.disabled = isLastMove || playback.isPlaying;
    playBtn.disabled = isLastMove;
    prevBtn.disabled = (0 === playback.stepIndex) || playback.isPlaying;

    restartSeqBtn.disabled = playback.isPlaying;
    solveBtn.disabled = playback.isPlaying;

    const scrollBehavior = playback.isPlaying ? 'auto' : 'smooth';

    clearPlateStateClasses();

    if (playback.stepIndex < playback.solution.length) {
        // Highlight the list entry for the upcoming move
        const activeDomIndex = playback.moveMap[playback.stepIndex];
        if (undefined !== activeDomIndex && solutionList.children[activeDomIndex]) {
            const activeEl = solutionList.children[activeDomIndex];
            setActiveStep(activeEl);
            if (0 === playback.stepIndex) {
                solutionList.scrollTop = 0;
            } else {
                activeEl.scrollIntoView({behavior: scrollBehavior, block: 'nearest'});
            }
        }

        // Highlight the plate about to move and glow its target hole
        const nextMove = playback.solution[playback.stepIndex];
        const activeBlock = gameState.blocks[nextMove.plate - 1];
        const elementsToGlow = [];

        if (activeBlock) {
            activeBlock.el.classList.add('right' === nextMove.direction ? UI_CLASSES.LINKED : UI_CLASSES.RINKED);

            let moveCount = 0;
            if (nextMove.count) {
                moveCount = nextMove.count;
            } else {
                for (let i = playback.stepIndex; i < playback.solution.length; i++) {
                    if (playback.solution[i].plate !== nextMove.plate || playback.solution[i].direction !== nextMove.direction) break;
                    moveCount++;
                }
            }

            const
                currentHoleOffset = Math.round(activeBlock.x / HOLE_SPACING),
                currentPinHole = 3 - currentHoleOffset,
                targetHoleIndex = 'right' === nextMove.direction
                    ? currentPinHole - moveCount
                    : currentPinHole + moveCount;

            if (targetHoleIndex >= 0 && targetHoleIndex <= 6) {
                const holes = activeBlock.el.querySelectorAll(`.${UI_CLASSES.HOLE}`);
                if (holes[targetHoleIndex]) elementsToGlow.push(holes[targetHoleIndex]);
            }
        }

        gameState.glowingHoles.forEach(h => {
            if (!elementsToGlow.includes(h)) scheduleGlowFadeOut(h);
        });

        elementsToGlow.forEach(h => {
            if (h.glowTimeoutId) {
                clearTimeout(h.glowTimeoutId);
                h.glowTimeoutId = null;
            }
            if (!h.classList.contains(UI_CLASSES.GLOW)) {
                h.classList.add(UI_CLASSES.GLOW);
                if (!gameState.glowingHoles.includes(h)) {
                    gameState.glowingHoles.push(h);
                }
            }
        });

    } else if (0 < playback.solution.length) {
        // Sequence finished: fade all glows, keep last step highlighted
        gameState.glowingHoles.forEach(scheduleGlowFadeOut);
        const lastDomIndex = playback.moveMap[playback.solution.length - 1];
        if (undefined !== lastDomIndex && solutionList.children[lastDomIndex]) {
            setActiveStep(solutionList.children[lastDomIndex]);
            solutionList.children[lastDomIndex].scrollIntoView({behavior: 'smooth', block: 'nearest'});
        }
    }
}

function renderSolutionList() {
    if (null === playback.solution) return;
    playback.lastActiveStepEl = null;
    playback.moveMap = [];
    const movesToRender = [];

    if (squashMovesCheck.checked) {
        let domIndex = 0;
        playback.solution.forEach((m, i) => {
            const last = movesToRender[movesToRender.length - 1];
            if (last && last.plate === m.plate && last.direction === m.direction) {
                last.count++;
                last.targetIndex = i + 1;
                playback.moveMap[i] = domIndex - 1;
            } else {
                movesToRender.push({...m, count: 1, targetIndex: i + 1});
                playback.moveMap[i] = domIndex;
                domIndex++;
            }
        });
    } else {
        playback.solution.forEach((m, i) => {
            movesToRender.push({...m, count: 1, targetIndex: i + 1});
            playback.moveMap[i] = i;
        });
    }

    const fragment = document.createDocumentFragment();
    movesToRender.forEach((m, index) => {
        const step = document.createElement('div');
        const icon = 'left' === m.direction ? '←' : '→';
        let text = `${index + 1}. Block ${m.plate} ${icon} ${m.direction.toUpperCase()}`;
        if (1 < m.count) text += ` (x${m.count})`;
        step.textContent = text;
        step.style.cursor = 'pointer';
        step.dataset.target = m.targetIndex;
        fragment.appendChild(step);
    });
    solutionList.replaceChildren(fragment);
    updatePlaybackUI();
}

solutionList.addEventListener('click', (e) => {
    const step = e.target.closest('[data-target]');
    if (step) jumpToStep(+step.dataset.target);
});

function toggleExpandList(forceState) {
    const isExpanded = undefined !== forceState
        ? forceState
        : solutionList.classList.toggle(UI_CLASSES.EXPANDED);
    if (undefined !== forceState) solutionList.classList.toggle(UI_CLASSES.EXPANDED, forceState);
    stepControlsRow.classList.toggle(UI_CLASSES.EXPANDED_PARENT, isExpanded);
    expandBtn.textContent = isExpanded ? '▲ Collapse List ▲' : '▼ Expand Full List ▼';

    if (isExpanded) {
        const
            rect = solutionList.getBoundingClientRect(),
            bottomPadding = window.innerHeight * 0.05,
            availableHeight = window.innerHeight - rect.top - bottomPadding - 45;
        solutionList.style.height = `${availableHeight}px`;
        solutionList.style.maxHeight = `${availableHeight}px`;
    } else {
        solutionList.style.height = '';
        solutionList.style.maxHeight = '';
    }

    // After the 0.3s stretch animation, snap-scroll to the active step
    setTimeout(() => {
        solutionList.style.scrollBehavior = 'auto';
        if (0 === playback.stepIndex) {
            solutionList.scrollTop = 0;
        } else if (playback.lastActiveStepEl) {
            playback.lastActiveStepEl.scrollIntoView({behavior: 'auto', block: 'nearest'});
        }
        setTimeout(() => solutionList.style.scrollBehavior = 'smooth', 50);
    }, 310);
}

expandBtn.addEventListener('click', () => toggleExpandList());

squashMovesCheck.addEventListener('change', () => {
    renderSolutionList();
    if (solutionList.classList.contains(UI_CLASSES.EXPANDED)) toggleExpandList(true);
});

/* 8. Pin & block state updates ------------------------------------------------------ */

function updateSinglePinMove(b, outTime) {
    updatePinState(b, {
        hidePin: true,
        wrapperTransition: `transform ${outTime / 1000}s ease-out`,
        pinTransition: 'transform 0.1s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
    });
    setTimeout(() => {
        updatePinState(b, {pinTransition: 'transform 0.1s cubic-bezier(0.175, 0.885, 0.32, 1.275)'});
    }, outTime);
}

function updatePinState(block, options = {}) {
    if (!gameState.isInteracted && !gameState.isRender) return;

    const {
        x = block.x,
        pin = block.pin,
        pinWrapper = block.pinWrapper,
        hidePin = false,
        wrapperTransition = null,
        pinTransition = null
    } = options;

    if (null !== wrapperTransition) pinWrapper.style.transition = wrapperTransition;
    if (null !== pinTransition) pin.style.transition = pinTransition;

    // The pin stays fixed in world space, so it counter-translates the plate
    pinWrapper.style.transform = `translateX(${-x}px)`;

    if (hidePin) {
        pin.style.transform = `translateZ(${PIN_UNDER}px)`;
        return;
    }

    const
        holeIndex = Math.round(x * ONE_OVER_HOLE_SPACING),
        distanceToHole = Math.abs(x - (holeIndex * HOLE_SPACING));

    if (distanceToHole >= 3) {
        if ('false' !== pin.dataset.wasOverHole) {
            pin.dataset.wasOverHole = 'false';
        }
        const targetTransform = `translateZ(${PIN_UNDER}px)`;
        if (pin.style.transform !== targetTransform) {
            pin.style.transform = targetTransform;
        }
        return;
    }

    if ('false' === pin.dataset.wasOverHole) {
        pin.dataset.wasOverHole = 'true';
        vibrate(15);
    }

    const targetTransform = `translateZ(${(0 === holeIndex) ? PIN_RAISED : PIN_MIDDLE}px)`;
    if (pin.style.transform !== targetTransform) {
        pin.style.transform = targetTransform;
    }
}

function updateBlockState(b, options = {}) {
    const {x = b.x, transition = null, pinTransition = null, pinTime = null} = options;

    b.x = x;
    b.el.style.transform = `translateZ(${b.z}px) translateX(${b.x}px)`;
    if (null !== transition) {
        b.el.style.transition = transition;
    }

    if (null === pinTime) {
        updatePinState(b, {wrapperTransition: transition, pinTransition: pinTransition});
    } else {
        updateSinglePinMove(b, pinTime);
    }

    scheduleMatchRefresh();
}

/* 9. Hover preview ---------------------------------------------------------------------- */

function updateHoverPreview(plate) {
    if (gameState.activeLinkerId || playback.solution) return;
    clearHoverPreview(true);
    if (!plate) return;

    const hoveredBlock = gameState.blocks.find(b => b.el === plate);
    if (!hoveredBlock) return;

    plate.classList.add(UI_CLASSES.TOUCHED);
    gameState.hoveredElements.push(plate);
    gameState.isHovering = true;

    const groupIds = Object.keys(hoveredBlock.group);
    if (1 === groupIds.length) return;

    groupIds.forEach(idStr => {
        const id = +idStr;
        if (id === hoveredBlock.id) return;
        const member = gameState.blocks.find(b => b.id === id);
        if (!member) return;

        member.el.classList.add(1 === hoveredBlock.group[id] ? UI_CLASSES.LINKED : UI_CLASSES.RINKED);
        gameState.hoveredElements.push(member.el);
    });
}

function clearHoverPreview(isEndHovering) {
    if (gameState.activeLinkerId || playback.solution) return;
    if (gameState.lastAction === ACTIONS.DESELECT) {
        gameState.lastAction = ACTIONS.DESELECT_DRAG_END;
        return;
    }
    if (!gameState.isHovering && !isEndHovering) return;

    if (gameState.hoveredElements.length > 0) {
        gameState.hoveredElements.forEach(el => el.classList.remove(UI_CLASSES.LINKED, UI_CLASSES.RINKED, UI_CLASSES.TOUCHED));
        gameState.hoveredElements = [];
    }

    gameState.isHovering = false;
}

/* 10. Plate creation & board rendering ----------------------------------------------------- */

function createPlate(id, prevX, zPos) {
    const
        plateNode = PLATE_TEMPLATE.content.cloneNode(true),
        plate = plateNode.firstElementChild;

    plate.dataset.id = id;
    plate.style.transform = `translateZ(${zPos}px) translateX(${prevX}px)`;

    const
        pinWrapper = plate.querySelector('.pin-wrapper'),
        pin = plate.querySelector('.pin');

    pinWrapper.style.transform = `translateX(${-prevX}px)`;
    pin.dataset.wasOverHole = 'true';

    plate.addEventListener('mouseenter', () => {
        if (Date.now() - (gameState.lastTouchTime || 0) < 500) return; // ignore synthetic post-touch hover
        updateHoverPreview(plate);
    });
    plate.addEventListener('mouseleave', () => clearHoverPreview(true));
    plate.addEventListener('touchstart', () => clearHoverPreview(true), {passive: true});

    return {plate, pinWrapper, pin};
}

function renderBlocks() {
    const
        count = +countInput.value,
        centerOffset = (count - 1) / 2,
        spacing = gameState.isMobile ? 55 : 50;

    // Preserve position and (multi-member) groups across re-renders
    const oldBlocksMap = gameState.blocks.length > 0
        ? new Map(gameState.blocks.map(b => [b.id, b]))
        : null;

    lock.innerHTML = '';
    gameState.blocks = [];
    gameState.activeLinkerId = null;

    const fragment = document.createDocumentFragment();

    for (let i = 0; i < count; i++) {
        const
            id = i + 1,
            zPos = (centerOffset - i) * spacing;

        let prevX = 0,
            currentGroup = null;

        const oldBlock = oldBlocksMap?.get(id);
        if (oldBlock) {
            prevX = oldBlock.x;
            const oldGroup = oldBlock.group;

            if (Object.keys(oldGroup).length > 1) {
                currentGroup = {};
                for (const key in oldGroup) {
                    const kid = +key;
                    if (kid <= count) {
                        currentGroup[kid] = oldGroup[key];
                    }
                }
            }
        }

        const {plate, pinWrapper, pin} = createPlate(id, prevX, zPos);
        fragment.prepend(plate);

        const b = {
            id: id,
            x: prevX,
            z: zPos,
            el: plate,
            pinWrapper: pinWrapper,
            pin: pin,
            group: currentGroup || {[id]: 1}
        };

        gameState.blocks.push(b);
        updatePinState(b);
    }

    lock.appendChild(fragment);
    renderInspectorRow();
    refreshMatches();
}

sizeInput.addEventListener('input', (e) => document.documentElement.style.setProperty('--block-scale', e.target.value));

countInput.addEventListener('input', () => {
    renderBlocks();
    clearSolutionUI();
    scheduleMatchRefresh();
});

function stepBlockCount(delta) {
    const
        current = +countInput.value,
        min = +countInput.min || 1,
        max = +countInput.max || 20,
        next = current + delta;
    if (next < min || next > max) return;
    countInput.value = next;
    countInput.dispatchEvent(new Event('input'));
}

btnDecrease.addEventListener('click', () => stepBlockCount(-1));
btnIncrease.addEventListener('click', () => stepBlockCount(+1));

resetBtn.addEventListener('click', () => {
    clearSolutionUI();
    gameState.blocks = [];
    gameState.activeLinkerId = null;
    gameState.dragState.activePlate = null;
    gameState.dragState.movingGroup = [];
    gameState.dragState.isDragging = false;
    gameState.isSolving = false;
    clearTimeout(gameState.dragState.longPressTimer);
    renderBlocks();
    refreshMatches();
});

/* 11. Drag / pinch / long-press input -------------------------------------------------------- */

/**
 * Long press behaviour:
 *  - no linker active  -> link mode
 *  - press master again -> deselect
 *  - press another plate (1, -1)
 */
function longPress(clickedId) {
    clearTimeout(gameState.dragState.longPressTimer);
    gameState.dragState.longPressTimer = setTimeout(() => {
        if (gameState.dragState.isDragging || !gameState.dragState.activePlate) return;

        const curBlock = gameState.blocks[clickedId - 1];
        if (!curBlock) return;

        if (null === gameState.activeLinkerId) {
            gameState.activeLinkerId = curBlock.id;
            gameState.dragState.activePlate.classList.add(UI_CLASSES.SELECTED);
            Object.keys(curBlock.group).forEach(idStr => {
                const id = +idStr;
                if (id === curBlock.id) return;
                const b = gameState.blocks[id - 1];
                if (!b) return;
                b.el.classList.add(1 === curBlock.group[id] ? UI_CLASSES.LINKED : UI_CLASSES.RINKED);
            });
            vibrate(15);
        } else if (gameState.activeLinkerId === curBlock.id) {
            gameState.activeLinkerId = null;
            gameState.dragState.activePlate.classList.remove(UI_CLASSES.SELECTED);
            gameState.lastAction = ACTIONS.DESELECT;
            updateHoverPreview(gameState.dragState.activePlate);
            vibrate(15);
            renderInspectorRow();
            scheduleMatchRefresh();
        } else {
            const masterBlock = gameState.blocks[gameState.activeLinkerId - 1];
            if (masterBlock.group[curBlock.id]) {
                if (1 === masterBlock.group[curBlock.id]) {
                    masterBlock.group[curBlock.id] = -1;
                    gameState.dragState.activePlate.classList.remove(UI_CLASSES.LINKED);
                    gameState.dragState.activePlate.classList.add(UI_CLASSES.RINKED);
                } else if (-1 === masterBlock.group[curBlock.id]) {
                    delete masterBlock.group[curBlock.id];
                    gameState.dragState.activePlate.classList.remove(UI_CLASSES.RINKED);
                }
            } else {
                masterBlock.group[curBlock.id] = 1;
                gameState.dragState.activePlate.classList.add(UI_CLASSES.LINKED);
            }
            vibrate(15);
        }
    }, gameState.activeLinkerId ? SHORT_PRESS_DURATION : LONG_PRESS_DURATION);
}

/** rAF-batched DOM update while dragging a plate group. */
function updateDragDOM() {
    const
        dragState = gameState.dragState,
        movingGroup = dragState.movingGroup,
        groupLen = movingGroup.length;

    dragState.rafId = null;

    if (!dragState.activePlate || 0 === groupLen) return;

    const rawDistX = dragState.currentClientX - dragState.startInputX;

    if (!dragState.isDragging && Math.abs(rawDistX) > DRAG_THRESHOLD) {
        dragState.isDragging = true;
        clearTimeout(dragState.longPressTimer);
    }

    if (!dragState.isDragging) return;

    const
        scale = dragState.scale || 1,
        rawDeltaX = rawDistX / scale,
        deltaX = Math.max(dragState.minDeltaX, Math.min(rawDeltaX, dragState.maxDeltaX));

    for (let i = 0; i < groupLen; i++) {
        const item = movingGroup[i];
        item.currentX = item.initialX + (deltaX * item.dir);
        updateBlockState(item.block, {x: item.currentX});
    }
}

function handleDragStart(e) {
    gameState.isInteracted = true;

    const
        touches = e.touches,
        dragState = gameState.dragState;

    if (touches) gameState.lastTouchTime = Date.now();

    // Two fingers -> pinch zoom
    if (touches && 2 <= touches.length) {
        document.body.classList.add(UI_CLASSES.ZOOMING);

        const t0 = touches[0], t1 = touches[1];
        pinchState.initialDistance = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
        pinchState.initialScale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--block-scale')) || 1;

        clearTimeout(dragState.longPressTimer);

        if (dragState.activePlate) {
            for (const item of dragState.movingGroup) {
                updateBlockState(item.block, {x: item.initialX});
            }
            dragState.activePlate = null;
            dragState.movingGroup.length = 0;
            dragState.isDragging = false;
            clearHoverPreview(true);
        }
        return;
    }

    const clickedPlate = e.target.closest(`.${UI_CLASSES.PLATE}`);
    if (!clickedPlate) {
        startOrbit(e);
        return;
    }

    if (e.type === 'mousedown') e.preventDefault();
    if (playback.solution) clearSolutionUI();

    dragState.hasMoved = false;
    dragState.activePlate = clickedPlate;
    dragState.startInputX = getClientX(e);
    dragState.isDragging = false;
    dragState.movingGroup.length = 0;
    dragState.scale = pinchState.lastScale
        || parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--block-scale'))
        || 1;

    updateHoverPreview(clickedPlate);

    const
        clickedId = +clickedPlate.dataset.id,
        blocks = gameState.blocks,
        clickedBlock = blocks[clickedId - 1];
    if (!clickedBlock) return;

    let minD = -Infinity, maxD = Infinity;

    const group = clickedBlock.group;
    for (const idStr in group) {
        const
            id = +idStr,
            b = blocks[id - 1],
            dirVal = group[idStr];

        if (!b) continue;

        dragState.movingGroup.push({block: b, dir: dirVal, initialX: b.x, currentX: b.x});
        b.el.style.transition = 'none';
        b.pinWrapper.style.transition = 'none';

        const
            dir = 1 === dirVal,
            minBound = dir ? -MAX_DELTA_LIMIT - b.x : b.x - MAX_DELTA_LIMIT,
            maxBound = dir ? MAX_DELTA_LIMIT - b.x : b.x + MAX_DELTA_LIMIT;

        if (minBound > minD) minD = minBound;
        if (maxBound < maxD) maxD = maxBound;
    }

    dragState.minDeltaX = minD;
    dragState.maxDeltaX = maxD;
    document.body.classList.add(UI_CLASSES.DRAGGING);
    gameState.lastAction = ACTIONS.DRAG_START;
    longPress(clickedId);
}

function handleDragMove(e) {
    //pinch
    if (e.touches && 2 === e.touches.length) {
        e.preventDefault();
        const t1 = e.touches[0], t2 = e.touches[1];

        if (!pinchState.initialDistance) {
            pinchState.initialDistance = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
            pinchState.initialScale = pinchState.lastScale;
        }

        const currentDistance = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        const newScale = Math.max(0.3, Math.min(pinchState.initialScale * (currentDistance / pinchState.initialDistance), 2));

        if (pinchState.lastScale !== newScale) {
            document.documentElement.style.setProperty('--block-scale', newScale);
            sizeInput.value = newScale;
            pinchState.lastScale = newScale;
        }
        return;
    }

    if (orbitState.active) {
        moveOrbit(e);
        return;
    }

    const dragState = gameState.dragState;
    if (!dragState.activePlate || 0 === dragState.movingGroup.length || gameState.activeLinkerId) return;

    dragState.hasMoved = true;
    dragState.currentClientX = getClientX(e);

    if (!dragState.rafId) {
        dragState.rafId = requestAnimationFrame(updateDragDOM);
    }
    gameState.lastAction = ACTIONS.DRAG_MOVE;
}

function handleDragEnd(e) {
    endOrbit();

    const {dragState} = gameState;
    const {activePlate, movingGroup, isDragging} = dragState;

    if (e?.changedTouches) gameState.lastTouchTime = Date.now();
    if (2 > (e?.touches?.length ?? 0)) document.body.classList.remove(UI_CLASSES.ZOOMING);

    pinchState.initialDistance = 0;
    clearTimeout(dragState.longPressTimer);

    if (dragState.rafId) {
        cancelAnimationFrame(dragState.rafId);
        dragState.rafId = null;
    }

    if (activePlate) clearHoverPreview();

    if (activePlate && movingGroup.length > 0 && isDragging) {
        const clickedId = +activePlate.dataset.id;

        let primary = movingGroup[0];
        for (const item of movingGroup) {
            if (item.block.id === clickedId) {
                primary = item;
                break;
            }
        }

        const
            currentX = primary.currentX ?? primary.initialX,
            holeIndex = Math.round(currentX / HOLE_SPACING);

        let snapDelta = (holeIndex * HOLE_SPACING) - currentX,
            maxAllowedShiftLeft = -Infinity,
            maxAllowedShiftRight = Infinity;

        for (const item of movingGroup) {
            const
                cx = item.currentX ?? item.initialX,
                cxDir = cx * item.dir;
            maxAllowedShiftLeft = Math.max(maxAllowedShiftLeft, -MAX_DELTA_LIMIT - cxDir);
            maxAllowedShiftRight = Math.min(maxAllowedShiftRight, MAX_DELTA_LIMIT - cxDir);
        }

        snapDelta = Math.max(maxAllowedShiftLeft, Math.min(snapDelta, maxAllowedShiftRight));

        for (const item of movingGroup) {
            const cx = item.currentX ?? item.initialX;
            updateBlockState(item.block, {x: cx + (snapDelta * item.dir), transition: 'transform 0.2s ease-out'});
        }
    }

    dragState.activePlate = null;
    dragState.movingGroup.length = 0;
    dragState.isDragging = false;
    document.body.classList.remove(UI_CLASSES.DRAGGING);

    if (ACTIONS.DESELECT_DRAG_END !== gameState.lastAction) {
        gameState.lastAction = ACTIONS.DRAG_END;
    }

    // Re-apply hover if the mouse is released over a plate
    if ('mouseup' === e?.type) {
        const timeSinceTouch = Date.now() - (gameState.lastTouchTime || 0);
        if (timeSinceTouch >= 500 && ACTIONS.DESELECT_DRAG_END !== gameState.lastAction) {
            const plateUnderCursor = document.elementFromPoint(e.clientX, e.clientY)?.closest(`.${UI_CLASSES.PLATE}`);
            if (plateUnderCursor) updateHoverPreview(plateUnderCursor);
        }
    }
}

function setupLongPress(button, stepFunction) {
    let pressTimer;
    let animTimer;
    let isLongPressExecuted = false;

    const startPress = () => {
        if (button.disabled) return;
        if (!gameState.isMobile) return;
        if (null === playback.solution || playback.isPlaying) return;

        isLongPressExecuted = false;

        animTimer = setTimeout(() => button.classList.add(UI_CLASSES.PRESSING), PRESS_ANIM_DELAY);

        pressTimer = setTimeout(() => {
            button.classList.remove(UI_CLASSES.PRESSING);
            isLongPressExecuted = true;
            stepFunction(true);
            if (navigator.vibrate) navigator.vibrate(50);
        }, HOLD_STEP_DURATION);
    };

    const clearPress = () => {
        clearTimeout(animTimer);
        clearTimeout(pressTimer);
        button.classList.remove(UI_CLASSES.PRESSING);
    };

    button.addEventListener('touchstart', startPress, {passive: true});
    button.addEventListener('touchend', clearPress);
    button.addEventListener('touchcancel', clearPress);
    button.addEventListener('click', (e) => {
        if (button.disabled) return;
        if (isLongPressExecuted) {
            e.preventDefault();
            return;
        }
        stepFunction(false);
    });
}

/* 11b. Camera orbit ----------------------------------------------------------
   The lock is a CSS 3D scene, so "the camera" is just the two rotations on
   .lock-mechanism. Dragging any empty space turns them; double-clicking that
   same empty space puts them back. Plates keep the pointer for themselves, so
   this only ever runs when the press missed one.
 */

const
    CAMERA_REST = {rx: -30, ry: -40},
    CAMERA_MIN = -85,
    CAMERA_MAX = 85,
    ORBIT_DEG_PER_PX = 0.4,
    DOUBLE_TAP_MS = 320,
    ORBIT_BLOCKERS = '.controls, footer, .about-panel, .search-panel, .tutorial-bubble, .tutorial-key, a, button, input';

const camera = {rx: CAMERA_REST.rx, ry: CAMERA_REST.ry};

const orbitState = {
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    startRx: 0,
    startRy: 0,
    rafId: null,
    lastTapTime: 0
};

const clampAngle = (deg) => Math.max(CAMERA_MIN, Math.min(deg, CAMERA_MAX));

function setCamera(rx, ry) {
    camera.rx = clampAngle(rx);
    camera.ry = clampAngle(ry);
    const style = document.documentElement.style;
    style.setProperty('--cam-rx', `${camera.rx.toFixed(2)}deg`);
    style.setProperty('--cam-ry', `${camera.ry.toFixed(2)}deg`);
}

function resetCamera() {
    document.body.classList.remove(UI_CLASSES.ORBITING);
    setCamera(CAMERA_REST.rx, CAMERA_REST.ry);
}

function isOrbitSurface(target) {
    return target instanceof Element && !target.closest(ORBIT_BLOCKERS);
}

/** rAF-batched, same as the plate drag: pointer events outrun repaints. */
function applyOrbit() {
    orbitState.rafId = null;
    if (!orbitState.active) return;

    const
        dx = orbitState.currentX - orbitState.startX,
        dy = orbitState.currentY - orbitState.startY;

    if (!orbitState.moved) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        orbitState.moved = true;
        document.body.classList.add(UI_CLASSES.ORBITING);
    }

    // Drag right and the front face follows the pointer; drag down and the top
    // tips towards you. Both are the "grab the object" convention.
    setCamera(
        orbitState.startRx - dy * ORBIT_DEG_PER_PX,
        orbitState.startRy + dx * ORBIT_DEG_PER_PX
    );
}

function startOrbit(e) {
    if (isGuideActive) return;
    if (e.touches && 1 !== e.touches.length) return;
    if (!isOrbitSurface(e.target)) return;

    if (Date.now() - orbitState.lastTapTime < DOUBLE_TAP_MS) {
        orbitState.lastTapTime = 0;
        resetCamera();
        return;
    }

    if ('mousedown' === e.type) e.preventDefault();

    orbitState.active = true;
    orbitState.moved = false;
    orbitState.startX = orbitState.currentX = getClientX(e);
    orbitState.startY = orbitState.currentY = getClientY(e);
    orbitState.startRx = camera.rx;
    orbitState.startRy = camera.ry;
}

function moveOrbit(e) {
    if (e.cancelable) e.preventDefault();

    orbitState.currentX = getClientX(e);
    orbitState.currentY = getClientY(e);

    if (!orbitState.rafId) {
        orbitState.rafId = requestAnimationFrame(applyOrbit);
    }
}

function endOrbit() {
    if (!orbitState.active) return;

    if (orbitState.rafId) {
        cancelAnimationFrame(orbitState.rafId);
        orbitState.rafId = null;
    }

    // A press that never moved is half of a double tap; a drag is not.
    orbitState.lastTapTime = orbitState.moved ? 0 : Date.now();
    orbitState.active = false;
    orbitState.moved = false;
    document.body.classList.remove(UI_CLASSES.ORBITING);
}

setCamera(CAMERA_REST.rx, CAMERA_REST.ry);

/* 12. INSPECTOR ROW -------------------------------------------------------------------- */

let currentHoveredBtn = null;

function resetInspectorHover() {
    if (!currentHoveredBtn) return;
    clearHoverPreview(true);
    currentHoveredBtn.style.background = currentHoveredBtn.dataset.defaultBg || '';
    currentHoveredBtn = null;
}

function setInspectorHover(btn) {
    if (currentHoveredBtn === btn) return;
    resetInspectorHover();
    currentHoveredBtn = btn;
    updateHoverPreview(btn.blockEl);
    btn.style.background = '#555';
}

function renderInspectorRow() {
    if (!inspectorRow) return;
    const GROUP_COLOR = '#66d437';
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < MAX_PLATES; i++) {
        const btn = document.createElement('button');
        btn.className = UI_CLASSES.INSPECT_BTN;
        btn.textContent = i + 1;
        btn.tabIndex = -1;
        if (i < gameState.blocks.length) {
            const block = gameState.blocks[i];
            let defaultBg = '';
            if (Object.keys(block.group).length > 1) {
                btn.style.borderColor = GROUP_COLOR;
                btn.style.color = GROUP_COLOR;
                defaultBg = `${GROUP_COLOR}22`;
            }
            btn.blockEl = block.el;
            btn.dataset.defaultBg = defaultBg;
            btn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                setInspectorHover(btn);
            }, {passive: false});
            btn.addEventListener('mouseenter', () => {
                if (Date.now() - (gameState.lastTouchTime || 0) < 500) return;
                setInspectorHover(btn);
            });
            btn.addEventListener('mouseleave', resetInspectorHover);
        } else {
            btn.classList.add(UI_CLASSES.DISABLED_BTN);
            btn.addEventListener('touchstart', (e) => e.preventDefault(), {passive: false});
        }
        fragment.appendChild(btn);
    }
    inspectorRow.replaceChildren(fragment);
}

// Slide a finger across the row to preview each plate's group
inspectorRow.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    const isActiveBtn = target
        && target.classList.contains(UI_CLASSES.INSPECT_BTN)
        && !target.classList.contains(UI_CLASSES.DISABLED_BTN);

    if (isActiveBtn) setInspectorHover(target);
    else resetInspectorHover();
}, {passive: false});

inspectorRow.addEventListener('touchend', resetInspectorHover);
inspectorRow.addEventListener('touchcancel', resetInspectorHover);

/* 13. Keyboard hotkeys (desktop) -------------------------------------------------------------- */

let spaceHeld = false,
    spaceStepped = false,
    spaceBtn = nextBtn,
    spaceAnimTimer = null,
    spaceHoldTimer = null;

function isTypingTarget() {
    const el = document.activeElement;
    return !!el && ('INPUT' === el.tagName || 'TEXTAREA' === el.tagName || el.isContentEditable);
}

function endSpaceHold() {
    clearTimeout(spaceAnimTimer);
    clearTimeout(spaceHoldTimer);
    spaceBtn.classList.remove(UI_CLASSES.PRESSING);
    spaceHeld = false;
}

document.addEventListener('keydown', (e) => {
    if (gameState.isMobile || e.defaultPrevented || isTypingTarget()) return;

    if ('Enter' === e.key) {
        e.preventDefault();
        if (!solveBtn.disabled) solveBtn.click();
        return;
    }

    if ('Backspace' === e.key) {
        e.preventDefault();
        const btn = e.ctrlKey ? resetBtn : restartSeqBtn;
        if (!btn.disabled) btn.click();
        return;
    }

    if ('Space' !== e.code && ' ' !== e.key) return;
    e.preventDefault();
    if (e.repeat || spaceHeld) return;
    if (null === playback.solution || playback.isPlaying) return;

    const back = e.ctrlKey;
    const btn = back ? prevBtn : nextBtn;
    if (btn.disabled) return;

    spaceHeld = true;
    spaceStepped = false;
    spaceBtn = btn;
    spaceAnimTimer = setTimeout(() => btn.classList.add(UI_CLASSES.PRESSING), PRESS_ANIM_DELAY);
    spaceHoldTimer = setTimeout(() => {
        btn.classList.remove(UI_CLASSES.PRESSING);
        spaceStepped = true;
        if (back) stepBackward(true);
        else stepForward(true);
    }, HOLD_STEP_DURATION);
});

document.addEventListener('keyup', (e) => {
    if ('Space' !== e.code && ' ' !== e.key) return;
    if (!spaceHeld) return;
    const back = prevBtn === spaceBtn;
    endSpaceHold();
    if (spaceStepped) return;
    if (back) stepBackward(false);
    else stepForward(false);
});

window.addEventListener('blur', endSpaceHold);

/* 14. Bootstrapping -------------------------------------------------------------------------------- */

setupLongPress(nextBtn, stepForward);
setupLongPress(prevBtn, stepBackward);

document.addEventListener('mousedown', handleDragStart);
document.addEventListener('mousemove', handleDragMove);
window.addEventListener('mouseup', handleDragEnd);
document.addEventListener('touchstart', handleDragStart, {passive: false});
document.addEventListener('touchmove', handleDragMove, {passive: false});
window.addEventListener('touchend', handleDragEnd);
document.addEventListener('touchcancel', handleDragEnd);

if (!loadFromURL()) {
    renderBlocks();
}