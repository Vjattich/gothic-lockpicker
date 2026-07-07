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
    DRAGGING: 'is-dragging'
};

const ACTIONS = {
    DESELECT: 'deselect',
    DESELECT_DRAG_END: 'deselectDragEnd',
    DRAG_START: 'handleDragStart',
    DRAG_MOVE: 'handleDragMove',
    DRAG_END: 'handleDragEnd'
};

const lock = document.getElementById('lock'),
    sizeInput = document.getElementById('sizeInput'),
    countInput = document.getElementById('countInput'),
    controls = document.getElementById('controls'),
    resetBtn = document.getElementById('resetBtn'),
    solveBtn = document.getElementById('solveBtn'),
    btnDecrease = document.getElementById('btnDecreaseBlocks'),
    btnIncrease = document.getElementById('btnIncreaseBlocks'),
    prevBtn = document.getElementById('prevBtn'),
    playBtn = document.getElementById('playBtn'),
    restartSeqBtn = document.getElementById('restartSeqBtn'),
    nextBtn = document.getElementById('nextBtn'),
    stepControlsRow = document.getElementById('stepControlsRow'),
    squashLabel = document.getElementById('squashLabel'),
    squashMovesCheck = document.getElementById('squashMovesCheck'),
    statusMsg = document.getElementById('statusMsg'),
    solutionList = document.getElementById('solutionList'),
    expandBtn = document.getElementById('expandBtn'),
    inspectorRow = document.getElementById('inspectorRow'),
    shareBtn = document.getElementById('shareBtn'),
    steamGuideBtn = document.getElementById('steamGuideBtn');

const
    PIN_RAISED = -10,
    PIN_MIDDLE = -5,
    PIN_UNDER = 1,
    LONG_PRESS_DURATION = 500,
    SHORT_PRESS_DURATION = 100,
    DRAG_THRESHOLD = 5,
    HOLE_SPACING = 36.5,
    MAX_BOUND = 3 * HOLE_SPACING,
    MAX_DELTA_LIMIT = 120,
    SOLVE_TIMEOUT_MS = 5000,
    MAX_PLATES = 8,
    ONE_OVER_HOLE_SPACING = 1 / HOLE_SPACING,
    PLATE_TEMPLATE = document.createElement('template');

(() => {
    const renderPinBody = function () {
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
        {class: 'tube-tr', startAngle: 0},
        {class: 'tube-br', startAngle: 90},
        {class: 'tube-bl', startAngle: 180},
        {class: 'tube-tl', startAngle: 270}
    ];

    corners.forEach(corner => {
        let Ydeg = '-30px';
        if ('tube-tl' === corner.class || 'tube-bl' === corner.class) Ydeg = '-29px';
        if ('tube-tr' === corner.class || 'tube-br' === corner.class) Ydeg = '-29.5px';
        tubeHtml += `<div class="corner-tube ${corner.class}">`;
        for (let a = 7.5; a < 90; a += 15) {
            tubeHtml += `<div class="tube-panel" style="transform: rotateZ(${corner.startAngle + a}deg) translateY(${Ydeg}) rotateX(-90deg)"></div>`;
        }
        tubeHtml += '</div>';
    });

    PLATE_TEMPLATE.innerHTML = `<div class="plate glow"><div class="front-face"></div><div class="top-face">${holesHtml}</div><div class="right-face"></div><div class="bottom-face"></div><div class="left-face"></div>${tubeHtml}</div>`;
})();

const gameState = {
        isInteracted: false,
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
            currentClientX: 0,
        },
        isMobile: false,
        lastTouchTime: 0,
        lastAction: null,
        isHovering: false,
        hoveredElements: [],
        glowingHoles: []
    },
    pinchState = {initialDistance: 0, initialScale: 0, lastScale: 0};

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

//antifreez
let resizeTimer = null;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        const wasMobile = gameState.isMobile;
        setInitialState();
        if (wasMobile !== gameState.isMobile) renderBlocks();
    }, 150);
});

if (gameState.isMobile) squashMovesCheck.checked = false;

const playback = {
    solution: null,
    stepIndex: 0,
    isPlaying: false,
    moveMap: [],
    initialSetup: null,
    lastActiveStepEl: null
};

function setStatus(text, type = 'info') {
    statusMsg.textContent = text;
    statusMsg.className = `status-message status-${type}`;
    const row = statusMsg.closest('.play-status-row');
    if ('' === text) {
        row.classList.remove(UI_CLASSES.SHOW_STRETCH);
    } else {
        row.classList.add(UI_CLASSES.SHOW_STRETCH);
    }
}

function clearSolutionUI() {
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

    gameState.blocks.forEach(b => b.el.classList.remove(UI_CLASSES.TOUCHED, UI_CLASSES.SELECTED, UI_CLASSES.LINKED, UI_CLASSES.RINKED));

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

function compactSetup() {
    const
        n = gameState.blocks.length,
        start = gameState.blocks.map(b => Math.round(b.x / HOLE_SPACING)),
        effects = [];
    for (let i = 0; i < n; i++) {
        const row = [];
        for (let j = 0; j < n; j++) {
            const targetId = j + 1;
            const relation = gameState.blocks[i].group[targetId] || 0;
            row.push(relation);
        }
        effects.push(row);
    }
    return {n, start, effects};
}

function solveInWorker() {
    if (undefined === window.Worker) return Promise.reject(new Error('Web Workers are not supported.'));
    const setup = compactSetup();
    const payload = {
        n: setup.n,
        start: setup.start,
        effects: setup.effects,
        mode: 'fewer-switches-fast',
        timeoutMs: SOLVE_TIMEOUT_MS
    };
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
        worker.postMessage(payload);
    });
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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
        updateBlockState(b, { x: targetX[i], transition: 'transform 0.2s ease-out', pinTime: 200 });
    });

    updatePlaybackUI();
}

function setActiveStep(el) {
    if (playback.lastActiveStepEl === el) return;
    if (playback.lastActiveStepEl) playback.lastActiveStepEl.classList.remove(UI_CLASSES.ACTIVE_STEP);
    if (el) el.classList.add(UI_CLASSES.ACTIVE_STEP);
    playback.lastActiveStepEl = el;
}

function updatePlaybackUI() {
    if (null === playback.solution) return;

    prevBtn.disabled = (0 === playback.stepIndex) || playback.isPlaying;
    nextBtn.disabled = (playback.stepIndex === playback.solution.length) || playback.isPlaying;
    playBtn.disabled = (playback.stepIndex === playback.solution.length);
    restartSeqBtn.disabled = playback.isPlaying;
    solveBtn.disabled = playback.isPlaying;

    const scrollBehavior = playback.isPlaying ? 'auto' : 'smooth';

    gameState.blocks.forEach(b => b.el.classList.remove(UI_CLASSES.TOUCHED, UI_CLASSES.SELECTED, UI_CLASSES.LINKED, UI_CLASSES.RINKED));

    if (playback.stepIndex < playback.solution.length) {
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

        const nextMove = playback.solution[playback.stepIndex];
        const activeBlock = gameState.blocks[nextMove.plate - 1];
        const elementsToGlow = [];

        if (activeBlock) {
            if ('right' === nextMove.direction) {
                activeBlock.el.classList.add(UI_CLASSES.LINKED);
            } else {
                activeBlock.el.classList.add(UI_CLASSES.RINKED);
            }

            let moveCount = 0;
            if (nextMove.count) {
                moveCount = nextMove.count;
            } else {
                for (let i = playback.stepIndex; i < playback.solution.length; i++) {
                    if (playback.solution[i].plate === nextMove.plate && playback.solution[i].direction === nextMove.direction) {
                        moveCount++;
                    } else {
                        break;
                    }
                }
            }

            const currentHoleOffset = Math.round(activeBlock.x / HOLE_SPACING);
            const currentPinHole = 3 - currentHoleOffset;
            const step = moveCount;
            const targetHoleIndex = nextMove.direction === 'right' ? currentPinHole - step : currentPinHole + step;

            if (targetHoleIndex >= 0 && targetHoleIndex <= 6) {
                const holes = activeBlock.el.querySelectorAll(`.${UI_CLASSES.HOLE}`);
                if (holes[targetHoleIndex]) elementsToGlow.push(holes[targetHoleIndex]);
            }
        }

        gameState.glowingHoles.forEach(h => {
            if (!elementsToGlow.includes(h) && !h.glowTimeoutId) {
                h.glowTimeoutId = setTimeout(() => {
                    h.classList.remove(UI_CLASSES.GLOW);
                    h.glowTimeoutId = null;
                    gameState.glowingHoles = gameState.glowingHoles.filter(glowing => glowing !== h);
                }, 250);
            }
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
        gameState.glowingHoles.forEach(h => {
            if (!h.glowTimeoutId) {
                h.glowTimeoutId = setTimeout(() => {
                    h.classList.remove(UI_CLASSES.GLOW);
                    h.glowTimeoutId = null;
                    gameState.glowingHoles = gameState.glowingHoles.filter(glowing => glowing !== h);
                }, 250);
            }
        });
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
    let domIndex = 0;
    if (squashMovesCheck.checked) {
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
            setStatus('Solver timed out! Try adjusting parameters.', 'error');
        } else if (!result || !result.moves) {
            setStatus('No solution found from this state.', 'error');
        } else if (result.moves.length === 0) {
            setStatus('', 'info');
        } else {
            playback.solution = result.moves;
            playback.stepIndex = 0;
            setStatus(`Solution found: ${result.moves.length} moves!`, 'success');
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
    setStatus('Restarting sequence...', 'info');
    while (playback.stepIndex > 0) {
        applySingleMove(playback.solution[playback.stepIndex - 1], true);
        playback.stepIndex--;
    }
    playBtn.textContent = '▶ Play';
    setStatus(`Solution found: ${playback.solution.length} moves!`, 'success');
    updatePlaybackUI();
});

function vibrate(duration) {
    if (false === gameState.isInteracted) {
        return;
    }

    if (navigator.vibrate) {
        navigator.vibrate(duration)
    }

    if (!navigator.getGamepads) return;
    const gamepads = navigator.getGamepads();
    for (const gamepad of gamepads) {
        if (gamepad && gamepad.vibrationActuator && typeof gamepad.vibrationActuator.playEffect === 'function') {
            gamepad.vibrationActuator.playEffect('dual-rumble', {
                startDelay: 0,
                duration: duration * 4,
                weakMagnitude: 1.0,
                strongMagnitude: 0.0
            }).catch(error => {
            });
            break;
        }
    }
}

function updateSinglePinMove(b, outTime) {
    updatePinState(b, {
        hidePin: true,
        wrapperTransition: 'transform 0.2s ease-out',
        pinTransition: 'transform 0.1s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
    });
    setTimeout(() => {
        updatePinState(b, {pinTransition: 'transform 0.1s cubic-bezier(0.175, 0.885, 0.32, 1.275)'});
    }, outTime);
}

function updatePinState(block, options = {}) {

    if (false === gameState.isInteracted && false === gameState.isRender) {
        return;
    }

    const {
        x = block.x,
        pin = block.pin,
        pinWrapper = block.pinWrapper,
        hidePin = false,
        wrapperTransition = null,
        pinTransition = null
    } = options;

    if (wrapperTransition !== null) {
        pinWrapper.style.transition = wrapperTransition;
    }
    if (pinTransition !== null) {
        pin.style.transition = pinTransition;
    }

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
    const {x = null, transition = null, pinTransition = null, pinTime = null} = options;

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
}

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
    if (groupIds.length <= 1) return;

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
        if (Date.now() - (gameState.lastTouchTime || 0) < 500) return;
        updateHoverPreview(plate);
    });
    plate.addEventListener('mouseleave', () => clearHoverPreview(true));
    plate.addEventListener('touchstart', () => clearHoverPreview(true), {passive: true});

    return { plate, pinWrapper, pin };
}

function loadFromURL() {
    const
        params = new URLSearchParams(window.location.search),
        stateParam = params.get('state');

    if (!stateParam) return false;

    try {
        const stateObj = JSON.parse(atob(stateParam));
        if (!stateObj.n || !stateObj.start || !stateObj.effects) return false;

        gameState.isRender = true;
        countInput.value = stateObj.n;
        gameState.blocks = [];
        renderBlocks();

        for (let i = 0; i < stateObj.n; i++) {
            const b = gameState.blocks[i];
            b.x = stateObj.start[i] * HOLE_SPACING;
            b.group = {};
            stateObj.effects[i].forEach((rel, j) => {
                if (rel !== 0) {
                    b.group[j + 1] = rel;
                }
            });
            updateBlockState(b, { x: b.x });
        }

        renderInspectorRow()

        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete('state');
        window.history.replaceState({}, document.title, cleanUrl.toString());
        solveBtn.click();
        return true;
    } catch (e) {
        console.error("Failed to load shared state:", e);
        return false;
    } finally {
        gameState.isRender = false
    }
}

function renderBlocks() {
    const
        count = +countInput.value,
        centerOffset = (count - 1) / 2,
        spacing = gameState.isMobile ? 55 : 50;

    let oldBlocksMap = null;
    if (gameState.blocks && gameState.blocks.length > 0) {
        oldBlocksMap = new Map(gameState.blocks.map(b => [b.id, b]));
    }

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

        if (oldBlocksMap) {
            const oldBlock = oldBlocksMap.get(id);
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
        }

        const { plate, pinWrapper, pin } = createPlate(id, prevX, zPos);
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
}

sizeInput.addEventListener('input', (e) => document.documentElement.style.setProperty('--block-scale', e.target.value));

countInput.addEventListener('input', (e) => {
    renderBlocks();
    clearSolutionUI();
});

btnDecrease.addEventListener('click', () => {
    const currentValue = +countInput.value,
        min = +countInput.min || 1;
    if (currentValue > min) {
        countInput.value = currentValue - 1;
        countInput.dispatchEvent(new Event('input'));
    }
});

btnIncrease.addEventListener('click', () => {
    const currentValue = +countInput.value,
        max = +countInput.max || 20;
    if (currentValue < max) {
        countInput.value = currentValue + 1;
        countInput.dispatchEvent(new Event('input'));
    }
});

function toggleExpandList(forceState) {
    const isExpanded = undefined !== forceState ? forceState : solutionList.classList.toggle(UI_CLASSES.EXPANDED);
    if (undefined !== forceState) solutionList.classList.toggle(UI_CLASSES.EXPANDED, forceState);
    const parentRow = document.getElementById('stepControlsRow');
    if (parentRow) parentRow.classList.toggle(UI_CLASSES.EXPANDED_PARENT, isExpanded);
    expandBtn.textContent = isExpanded ? '▲ Collapse List ▲' : '▼ Expand Full List ▼';

    if (isExpanded) {
        const rect = solutionList.getBoundingClientRect(),
            bottomPadding = window.innerHeight * 0.05,
            availableHeight = window.innerHeight - rect.top - bottomPadding - 45;
        solutionList.style.height = `${availableHeight}px`;
        solutionList.style.maxHeight = `${availableHeight}px`;
    } else {
        solutionList.style.height = '';
        solutionList.style.maxHeight = '';
    }

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

resetBtn.addEventListener('click', () => {
    clearSolutionUI();
    gameState.blocks = [];
    gameState.activeLinkerId = null;
    gameState.dragState.activePlate = null;
    gameState.dragState.movingGroup = [];
    gameState.dragState.isDragging = false;
    clearTimeout(gameState.dragState.longPressTimer);
    renderBlocks();
});

if (!loadFromURL()) {
    renderBlocks();
}

function getClientX(e) {
    return e.touches && e.touches.length > 0 ? e.touches[0].clientX : e.clientX;
}

function longPress(clickedId) {
    clearTimeout(gameState.dragState.longPressTimer);
    gameState.dragState.longPressTimer = setTimeout(() => {
        if (!gameState.dragState.isDragging && gameState.dragState.activePlate) {
            const curBlock = gameState.blocks[clickedId - 1];
            if (!curBlock) return;
            if (null === gameState.activeLinkerId) {
                gameState.activeLinkerId = curBlock.id;
                gameState.dragState.activePlate.classList.add(UI_CLASSES.SELECTED);
                Object.keys(curBlock.group).forEach(idStr => {
                    const id = +idStr;
                    if (id !== curBlock.id) {
                        const b = gameState.blocks[id - 1];
                        if (b) {
                            if (1 === curBlock.group[id]) {
                                b.el.classList.add(UI_CLASSES.LINKED);
                            } else {
                                b.el.classList.add(UI_CLASSES.RINKED);
                            }
                        }
                    }
                });
                vibrate(15);
            } else if (gameState.activeLinkerId === curBlock.id) {
                gameState.activeLinkerId = null;
                gameState.dragState.activePlate.classList.remove(UI_CLASSES.SELECTED);
                gameState.lastAction = ACTIONS.DESELECT;
                updateHoverPreview(gameState.dragState.activePlate);
                vibrate(15);
                renderInspectorRow();
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
        }
    }, gameState.activeLinkerId ? SHORT_PRESS_DURATION : LONG_PRESS_DURATION);
}

function applySingleMove(move, reverse = false) {
    const
        primaryBlock = gameState.blocks[move.plate - 1],
        stepShift = ('left' === move.direction) === reverse ? HOLE_SPACING : -HOLE_SPACING;

    Object.keys(primaryBlock.group).forEach(i => {
        const
            id = +i,
            relativeDir = (primaryBlock.group[id]),
            b = gameState.blocks[id - 1];
        if (!b) return;
        updateBlockState(
            b,
            {
                x: Math.max(-MAX_BOUND, Math.min(MAX_BOUND, b.x + stepShift * relativeDir)),
                transition: 'transform 0.2s ease-out',
                pinTime: 200
            }
        );
    });
}

function updateDragDOM() {
    const
        dragState = gameState.dragState,
        movingGroup = dragState.movingGroup,
        groupLen = movingGroup.length;

    dragState.rafId = null;

    if (!dragState.activePlate || groupLen === 0) return;

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
        updateBlockState(item.block, { x: item.currentX });
    }
}

function handleDragStart(e) {
    gameState.isInteracted = true;

    const touches = e.touches,
        dragState = gameState.dragState;

    if (touches) gameState.lastTouchTime = Date.now();

    if (touches && touches.length >= 2) {
        document.body.classList.add(UI_CLASSES.ZOOMING);

        const t0 = touches[0], t1 = touches[1];
        pinchState.initialDistance = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
        pinchState.initialScale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--block-scale')) || 1;

        clearTimeout(dragState.longPressTimer);

        if (dragState.activePlate) {
            const movingGroup = dragState.movingGroup;
            for (let i = 0, len = movingGroup.length; i < len; i++) {
                updateBlockState(movingGroup[i].block, { x: movingGroup[i].initialX });
            }
            dragState.activePlate = null;
            dragState.movingGroup.length = 0;
            dragState.isDragging = false;
            clearHoverPreview(true);
        }
        return;
    }

    const clickedPlate = e.target.closest(`.${UI_CLASSES.PLATE}`);
    if (!clickedPlate) return;

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

    const clickedId = +clickedPlate.dataset.id;
    const blocks = gameState.blocks;

    const clickedBlock = blocks[clickedId - 1];
    if (!clickedBlock) return;

    let minD = -Infinity, maxD = Infinity;

    const group = clickedBlock.group;
    for (const idStr in group) {
        const
            id = +idStr,
            b = blocks[id - 1],
            dirVal = group[idStr];

        if (b) {
            dragState.movingGroup.push({ block: b, dir: dirVal, initialX: b.x, currentX: b.x });
            b.el.style.transition = 'none';
            b.pinWrapper.style.transition = 'none';

            const
                dir = dirVal === 1,
                minBound = dir ? -MAX_DELTA_LIMIT - b.x : b.x - MAX_DELTA_LIMIT,
                maxBound = dir ? MAX_DELTA_LIMIT - b.x : b.x + MAX_DELTA_LIMIT;

            if (minBound > minD) minD = minBound;
            if (maxBound < maxD) maxD = maxBound;
        }
    }

    dragState.minDeltaX = minD;
    dragState.maxDeltaX = maxD;
    document.body.classList.add(UI_CLASSES.DRAGGING);
    gameState.lastAction = ACTIONS.DRAG_START;
    longPress(clickedId);
}

function handleDragMove(e) {
    if (e.touches && 2 === e.touches.length) {
        e.preventDefault();
        const t1 = e.touches[0], t2 = e.touches[1];

        if (!pinchState.initialDistance) {
            const dx = t1.clientX - t2.clientX;
            const dy = t1.clientY - t2.clientY;
            pinchState.initialDistance = Math.hypot(dx, dy);
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
    const { dragState } = gameState;
    const { activePlate, movingGroup, isDragging } = dragState;

    if (e?.changedTouches) gameState.lastTouchTime = Date.now();
    if ((e?.touches?.length ?? 0) < 2) document.body.classList.remove('is-zooming');

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
        for (let i = 0; i < movingGroup.length; i++) {
            if (movingGroup[i].block.id === clickedId) {
                primary = movingGroup[i];
                break;
            }
        }

        const currentX = primary.currentX ?? primary.initialX;
        const holeIndex = Math.round(currentX / HOLE_SPACING);

        let snapDelta = (holeIndex * HOLE_SPACING) - currentX,
            maxAllowedShiftLeft = -Infinity,
            maxAllowedShiftRight = Infinity;

        for (let i = 0; i < movingGroup.length; i++) {
            const
                item = movingGroup[i],
                cx = item.currentX ?? item.initialX,
                cxDir = cx * item.dir;
            maxAllowedShiftLeft = Math.max(maxAllowedShiftLeft, -MAX_DELTA_LIMIT - cxDir);
            maxAllowedShiftRight = Math.min(maxAllowedShiftRight, MAX_DELTA_LIMIT - cxDir);
        }

        snapDelta = Math.max(maxAllowedShiftLeft, Math.min(snapDelta, maxAllowedShiftRight));

        for (let i = 0; i < movingGroup.length; i++) {
            const item = movingGroup[i];
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

    if (e?.type === 'mouseup') {
        const timeSinceTouch = Date.now() - (gameState.lastTouchTime || 0);
        if (timeSinceTouch >= 500 && ACTIONS.DESELECT_DRAG_END !== gameState.lastAction) {
            const plateUnderCursor = document.elementFromPoint(e.clientX, e.clientY)?.closest(`.${UI_CLASSES.PLATE}`);
            if (plateUnderCursor) updateHoverPreview(plateUnderCursor);
        }
    }
}

function getNextSquashedIndex() {
    if (null === playback.solution || playback.stepIndex >= playback.solution.length) return playback.stepIndex;
    const currentMove = playback.solution[playback.stepIndex];
    let nextIdx = playback.stepIndex + 1;
    while (nextIdx < playback.solution.length) {
        const move = playback.solution[nextIdx];
        if (move.plate === currentMove.plate && move.direction === currentMove.direction) {
            nextIdx++;
        } else {
            break;
        }
    }
    return nextIdx + 1;
}

function getPrevSquashedIndex() {
    if (null === playback.solution || playback.stepIndex <= 0) return playback.stepIndex;
    const currentMove = playback.solution[playback.stepIndex - 1];
    let prevIdx = playback.stepIndex - 1;
    while (prevIdx > 0) {
        const move = playback.solution[prevIdx - 1];
        if (move.plate === currentMove.plate && move.direction === currentMove.direction) {
            prevIdx--;
        } else {
            break;
        }
    }
    return prevIdx + 1;
}

function stepForward(forceSquash = false) {
    if (null === playback.solution || playback.isPlaying || playback.stepIndex >= playback.solution.length) return;
    if (squashMovesCheck.checked || forceSquash) {
        const targetIdx = getNextSquashedIndex();
        jumpToStep(targetIdx);
    } else {
        applySingleMove(playback.solution[playback.stepIndex], false);
        playback.stepIndex++;
        updatePlaybackUI();
    }
}

function stepBackward(forceSquash = false) {
    if (null === playback.solution || playback.isPlaying || playback.stepIndex <= 0) return;
    if (squashMovesCheck.checked || forceSquash) {
        const targetIdx = getPrevSquashedIndex();
        jumpToStep(targetIdx);
    } else {
        playback.stepIndex--;
        applySingleMove(playback.solution[playback.stepIndex], true);
        updatePlaybackUI();
    }
}

function setupLongPress(button, stepFunction) {
    let pressTimer;
    let animTimer;
    let isLongPressExecuted = false;

    const startPress = (e) => {
        if (button.disabled) return;
        if (!gameState.isMobile) return;
        if (null === playback.solution || playback.isPlaying) return;

        isLongPressExecuted = false;

        animTimer = setTimeout(() => button.classList.add(UI_CLASSES.PRESSING), 150);

        pressTimer = setTimeout(() => {
            button.classList.remove(UI_CLASSES.PRESSING);
            isLongPressExecuted = true;
            stepFunction(true);
            if (navigator.vibrate) navigator.vibrate(50);
        }, 600);
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

function renderInspectorRow() {
    if (!inspectorRow || !gameState.isMobile) return;
    const GROUP_COLOR = '#66d437';
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < MAX_PLATES; i++) {
        const btn = document.createElement('button');
        btn.className = UI_CLASSES.INSPECT_BTN;
        btn.textContent = i + 1;
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
                if (currentHoveredBtn && currentHoveredBtn !== btn) {
                    currentHoveredBtn.style.background = currentHoveredBtn.dataset.defaultBg || '';
                }
                currentHoveredBtn = btn;
                updateHoverPreview(block.el);
                btn.style.background = '#555';
            }, {passive: false});
        } else {
            btn.classList.add(UI_CLASSES.DISABLED_BTN);
            btn.addEventListener('touchstart', (e) => e.preventDefault(), {passive: false});
        }
        fragment.appendChild(btn);
    }
    inspectorRow.replaceChildren(fragment);
}

let currentHoveredBtn = null;
inspectorRow.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    if (target && target.classList.contains(UI_CLASSES.INSPECT_BTN) && !target.classList.contains(UI_CLASSES.DISABLED_BTN)) {
        if (currentHoveredBtn !== target) {
            if (currentHoveredBtn) {
                clearHoverPreview(true);
                currentHoveredBtn.style.background = currentHoveredBtn.dataset.defaultBg || '';
            }
            currentHoveredBtn = target;
            updateHoverPreview(target.blockEl);
            target.style.background = '#555';
        }
    } else {
        if (currentHoveredBtn) {
            clearHoverPreview(true);
            currentHoveredBtn.style.background = currentHoveredBtn.dataset.defaultBg || '';
            currentHoveredBtn = null;
        }
    }
}, {passive: false});

const releaseSlidingTouch = () => {
    if (currentHoveredBtn) {
        clearHoverPreview(true);
        currentHoveredBtn.style.background = currentHoveredBtn.dataset.defaultBg || '';
        currentHoveredBtn = null;
    }
};

inspectorRow.addEventListener('touchend', releaseSlidingTouch);
inspectorRow.addEventListener('touchcancel', releaseSlidingTouch);

setupLongPress(nextBtn, stepForward);
setupLongPress(prevBtn, stepBackward);
document.addEventListener('mousedown', handleDragStart);
document.addEventListener('mousemove', handleDragMove);
window.addEventListener('mouseup', handleDragEnd);
document.addEventListener('touchstart', handleDragStart, {passive: false});
document.addEventListener('touchmove', handleDragMove, {passive: false});
window.addEventListener('touchend', handleDragEnd);
document.addEventListener('touchcancel', handleDragEnd);

let shareStatusTimeout;

shareBtn.addEventListener('click', () => {
    const
        value = playback.initialSetup || compactSetup(),
        encoded = btoa(JSON.stringify(value)),
        url = new URL(window.location.href);

    url.searchParams.set('state', encoded);

    navigator.clipboard.writeText(url.toString()).then(() => {
        setStatus('Share link copied to clipboard!', 'success');
        clearTimeout(shareStatusTimeout);
        shareStatusTimeout = setTimeout(() => {
            if ('Share link copied to clipboard!' === statusMsg.textContent) {
                setStatus('', 'info');
            }
        }, 1500);
    }).catch(err => {
        setStatus('Failed to copy link.', 'error');
    });
});