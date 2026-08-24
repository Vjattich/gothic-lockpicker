'use strict';
const
    tutorialOverlay = document.getElementById('tutorialOverlay'),
    tutorialBubble = document.getElementById('tutorialBubble'),
    tutorialText = document.getElementById('tutorialText'),
    tutorialArrow = document.getElementById('tutorialArrow'),
    tutorialArrow2 = document.getElementById('tutorialArrow2'),
    tutorialKey = document.getElementById('tutorialKey'),
    questionMarkBtn = document.querySelector('.question-mark'),
    guidePrev = document.getElementById('guidePrev'),
    guideNext = document.getElementById('guideNext'),
    footer = document.querySelector('footer'),
    aboutPanel = document.getElementById('aboutPanel'),
    aboutCloseBtn = document.getElementById('aboutClose');

let tutorialStep = 0,
    currentTutorialVersion = 0,
    sleepResolver = null;

function wakeUpSleep() {
    if (sleepResolver) {
        sleepResolver();
        sleepResolver = null;
    }
}

function stepSleep(ms) {
    return new Promise(resolve => {
        const timer = setTimeout(() => {
            sleepResolver = null;
            resolve();
        }, ms);

        sleepResolver = () => {
            clearTimeout(timer);
            resolve();
        };
    });
}

const HOTKEYS = {
    next: {btn: nextBtn, labels: ['SPACE'], code: 'Space', key: ' ', ctrl: false},
    prev: {btn: prevBtn, labels: ['CTRL', 'SPACE'], code: 'Space', key: ' ', ctrl: true},
    restart: {btn: restartSeqBtn, labels: ['BACKSPACE'], code: 'Backspace', key: 'Backspace', ctrl: false},
    reset: {btn: resetBtn, labels: ['CTRL', 'BACKSPACE'], code: 'Backspace', key: 'Backspace', ctrl: true}
};

function positionArrowRelative(target, offsetX = 0, offsetY = 0, arrowElement = tutorialArrow) {
    if (!target) return;
    const rect = target.getBoundingClientRect();
    arrowElement.style.top = `${rect.top + offsetY}px`;
    arrowElement.style.left = `${rect.left + offsetX}px`;
    arrowElement.style.display = 'block';
}

function hideArrows() {
    tutorialArrow.style.display = 'none';
    tutorialArrow2.style.display = 'none';
}

function renderHotkeyCaps(labels) {
    let x = 3, bases = '', caps = '', plus = '';
    labels.forEach((label, i) => {
        const w = label.length * 13 + 26;
        if (i) plus += `<text class="key-plus" x="${x - 8}" y="22">+</text>`;
        bases += `<rect class="key-base" x="${x}" y="11" width="${w}" height="38" rx="8"/>`;
        caps += `<rect x="${x}" y="3" width="${w}" height="38" rx="8"/><text x="${x + w / 2}" y="22">${label}</text>`;
        x += w + 16;
    });
    const width = x - 13;
    tutorialKey.innerHTML = `<svg height="52" viewBox="0 0 ${width} 52" width="${width}">${bases}${plus}<g class="key-cap">${caps}</g></svg>`;
}

function showHotkey(hotkey) {
    if (document.activeElement) document.activeElement.blur();
    renderHotkeyCaps(hotkey.labels);
    const rect = hotkey.btn.getBoundingClientRect();
    tutorialKey.style.display = 'block';
    tutorialKey.style.top = `${rect.bottom + 14}px`;
    tutorialKey.style.left = `${Math.max(tutorialKey.offsetWidth / 2 + 10, rect.left + rect.width / 2)}px`;
}

function hideHotkey() {
    tutorialKey.style.display = 'none';
    tutorialKey.classList.remove('is-pressed');
}

function dispatchHotkey(type, hotkey) {
    document.dispatchEvent(new KeyboardEvent(type, {
        code: hotkey.code,
        key: hotkey.key,
        ctrlKey: hotkey.ctrl,
        bubbles: true,
        cancelable: true
    }));
}

async function pressHotkey(hotkey, holdMs) {
    tutorialKey.classList.add('is-pressed');
    pressButtonVisual(hotkey.btn);
    dispatchHotkey('keydown', hotkey);
    await stepSleep(holdMs);
    dispatchHotkey('keyup', hotkey);
    releaseButtonVisual(hotkey.btn);
    tutorialKey.classList.remove('is-pressed');
}

function dispatchAll(el, ...types) {
    types.forEach(type => el.dispatchEvent(new Event(type)));
}

function pressButtonVisual(btn) {
    btn.style.transform = 'scale(0.9)';
    btn.style.filter = 'brightness(0.7)';
    dispatchAll(btn, 'pointerdown', 'mousedown', 'touchstart');
}

function releaseButtonVisual(btn) {
    dispatchAll(btn, 'pointerup', 'mouseup', 'touchend');
    btn.style.transform = '';
    btn.style.filter = '';
}

async function simulateHold(btn, holdMs) {
    pressButtonVisual(btn);
    await stepSleep(holdMs);
    releaseButtonVisual(btn);
}

questionMarkBtn.addEventListener('click', () => {
    if (isGuideActive) {
        endTutorial();
    } else {
        startTutorial();
    }
});

guidePrev.addEventListener('click', () => {
    if (tutorialStep <= 1) return;
    tutorialStep--;
    advanceTutorial();
});

guideNext.addEventListener('click', () => {
    tutorialStep++;
    advanceTutorial();
});

/**
 * The About panel has no button of its own - the guide opens it as its last
 * step (see TUTORIAL_STEPS.about) and closing it ends the guide. It stays in
 * the DOM either way so its text is indexable.
 */
function setAboutOpen(open) {
    aboutPanel.classList.toggle('is-open', open);
}

function dismissAbout() {
    setAboutOpen(false);
    if (isGuideActive) endTutorial();
}

aboutCloseBtn.addEventListener('click', dismissAbout);

aboutPanel.addEventListener('click', (e) => {
    if (e.target === aboutPanel) dismissAbout();
});

document.addEventListener('keydown', (e) => {
    if ('Escape' === e.key && aboutPanel.classList.contains('is-open')) {
        dismissAbout();
    }
});

function advanceTutorial() {
    currentTutorialVersion++;
    wakeUpSleep();
    setTimeout(() => runTutorialStep(currentTutorialVersion), 0);
}

function startTutorial() {
    updateMatchCount([]);
    isGuideActive = true;
    document.body.classList.add('tutorial-active', 'tutorial-on');
    resetBtn.click();
    tutorialOverlay.style.display = 'block';
    tutorialBubble.style.display = 'block';
    tutorialStep = 1;
    advanceTutorial();
    footer.style.zIndex = '1001';
    if (gameState.isMobile) {
        controls.style.transition = 'top 0.4s ease-out';
        controls.style.top = '55%';
    }
}

function endTutorial() {
    isGuideActive = false;
    scheduleMatchRefresh();
    document.body.classList.remove('tutorial-active', 'tutorial-on');
    currentTutorialVersion++;
    wakeUpSleep();
    tutorialOverlay.style.display = 'none';
    tutorialBubble.style.display = 'none';
    setAboutOpen(false);
    hideArrows();
    resetBtn.click();
    footer.style.zIndex = '';
    if (gameState.isMobile) {
        controls.style.top = '';
        setTimeout(() => {
            if (!isGuideActive) {
                controls.style = null;
            }
        }, 400);
    }
}

function clean() {
    hideArrows();
    hideHotkey();
    endSpaceHold();
    setAboutOpen(false);

    tutorialSearchDemo = false;
    setSearchOpen(false);

    clearSolutionUI();
    clearHoverPreview();

    gameState.blocks.forEach(b => {
        b.el.classList.remove(UI_CLASSES.SELECTED, UI_CLASSES.LINKED, UI_CLASSES.RINKED, UI_CLASSES.TOUCHED);
        b.el.querySelector('.front-face').style.borderColor = '';

        if (b.x !== 0) {
            updateBlockState(b, {
                x: 0,
                transition: 'transform 0.5s ease',
                pinTime: b.pin && b.pin.style.transform.includes(`translateZ(${PIN_RAISED}px)`) ? null : 400
            });
        }
    });

    if (typeof inspectorRow !== 'undefined' && inspectorRow) {
        Array.from(inspectorRow.children).forEach(btn => {
            btn.style.background = btn.dataset.defaultBg || '';
        });
    }

    [nextBtn, prevBtn, restartSeqBtn, resetBtn].forEach(btn => {
        if (btn) releaseButtonVisual(btn);
    });

    if (6 !== +countInput.value && 'adjustPlates' !== currentStepName()) {
        countInput.value = 6;
        renderBlocks();
    }
}

/**
 * The order of tutorial steps. tutorialStep is a 1-based index into this array,
 * so inserting a new step is just inserting its name here — no renumbering.
 * resetHotkeys is keyboard-only, so it drops out of the order on mobile.
 */
const TUTORIAL_ORDER = [
    'zoom',
    'dragPlates',
    'adjustPlates',
    'groupPlates',
    'inspectGroups',
    'stepControls',
    'resetHotkeys',
    'searchCount',
    'searchPick',
    'autoPlay',
    'share',
    'about'
];

function currentStepName() {
    const order = TUTORIAL_ORDER.filter(name => !gameState.isMobile || 'resetHotkeys' !== name);
    return order[tutorialStep - 1];
}

const TUTORIAL_STEPS = {

    async zoom(cancelled) {
        clean();

        tutorialText.textContent = gameState.isMobile
            ? 'Use a two-finger pinch gesture on the screen to zoom in or out.'
            : 'Use the slider to adjust zooming.';

        const baseScale = sizeInput ? parseFloat(sizeInput.value) : 1;

        const setScale = (scale) => {
            document.documentElement.style.setProperty('--block-scale', scale.toFixed(2));
            if (sizeInput) sizeInput.value = scale;
        };

        while (!cancelled()) {
            for (let i = 0; i <= 20 && !cancelled(); i++) {
                setScale(baseScale + (i / 20) * 0.2);
                await stepSleep(40);
            }

            await stepSleep(500);
            if (cancelled()) break;

            for (let i = 0; i <= 20 && !cancelled(); i++) {
                setScale((baseScale + 0.2) - (i / 20) * 0.2);
                await stepSleep(40);
            }

            await stepSleep(1000);
        }

        setScale(baseScale);
    },

    async dragPlates(cancelled) {
        clean();
        tutorialText.textContent = 'You can drag selected plates left or right.';
        let plateIndex = 0;
        while (!cancelled()) {
            gameState.blocks.forEach(b => b.el.querySelector('.front-face').style.borderColor = '');
            if (gameState.blocks.length > 0) {
                const plate = gameState.blocks[plateIndex % gameState.blocks.length].el;
                plate.querySelector('.front-face').style.borderColor = 'white';
                plateIndex++;
            }
            await stepSleep(600);
        }
    },

    async adjustPlates(cancelled) {
        tutorialText.textContent = 'Adjust plates like in a game: plates count and plates position.';
        while (!cancelled()) {
            if (6 !== +countInput.value) {
                countInput.value = 6;
                renderBlocks();
            }
            await stepSleep(500);
            if (cancelled()) break;

            positionArrowRelative(btnIncrease, 15, -40);
            await stepSleep(600);
            if (cancelled()) break;
            for (let i = 0; i < 2 && !cancelled(); i++) {
                btnIncrease.click();
                await stepSleep(600);
            }
            if (cancelled()) break;

            positionArrowRelative(btnDecrease, 15, -40);
            await stepSleep(600);
            if (cancelled()) break;
            for (let i = 0; i < 2 && !cancelled(); i++) {
                btnDecrease.click();
                await stepSleep(600);
            }
            if (cancelled()) break;

            tutorialArrow.style.display = 'none';
            await stepSleep(400);

            const presets = [
                [-HOLE_SPACING, HOLE_SPACING, -HOLE_SPACING * 2, 0, HOLE_SPACING * 2, 0],
                [HOLE_SPACING * 2, -HOLE_SPACING, 0, HOLE_SPACING, -HOLE_SPACING * 2, HOLE_SPACING],
                [0, 0, HOLE_SPACING * 3, -HOLE_SPACING * 3, HOLE_SPACING, -HOLE_SPACING]
            ];
            for (const positions of presets) {
                gameState.blocks.forEach((b, i) => {
                    updateBlockState(b, {x: positions[i] || 0, transition: 'transform 0.5s ease', pinTime: 400});
                });
                await stepSleep(1500);
            }
            clean();
            await stepSleep(1000);
        }
    },

    async groupPlates(cancelled) {
        clean();
        tutorialText.textContent = 'Long-press to group plates. Blue moves with it, Red opposite. Tap again to deselect.';
        while (!cancelled()) {
            clean();
            await stepSleep(1200);
            if (cancelled()) break;

            if (gameState.blocks.length < 3) {
                await stepSleep(1000);
                continue;
            }

            const [p1, p2, p3] = gameState.blocks;
            p1.el.classList.add(UI_CLASSES.SELECTED);
            await stepSleep(800);
            if (cancelled()) break;

            positionArrowRelative(p2.el, 10, -50);
            await stepSleep(600);
            p2.el.classList.add(UI_CLASSES.LINKED);
            await stepSleep(800);
            if (cancelled()) break;

            positionArrowRelative(p3.el, 10, -50);
            await stepSleep(600);
            p3.el.classList.add(UI_CLASSES.RINKED);
            await stepSleep(800);
            if (cancelled()) break;

            tutorialArrow.style.display = 'none';

            // Swing the whole group left and right with a sine wave
            const maxLimit = HOLE_SPACING * 1.5,
                totalFrames = 180;
            for (let i = 0; i <= totalFrames && !cancelled(); i++) {
                const offset = Math.sin((i / totalFrames) * Math.PI * 2) * maxLimit;
                [{b: p1, dir: 1}, {b: p2, dir: 1}, {b: p3, dir: -1}].forEach(item => {
                    updateBlockState(item.b, {
                        x: offset * item.dir,
                        transition: 'none',
                        pinTransition: 'transform 0.03s ease-out'
                    });
                });
                await stepSleep(16);
            }
        }
    },

    async inspectGroups(cancelled) {
        clean();
        tutorialText.textContent = gameState.isMobile
            ? 'Touch the number row to see what groups are selected for plate'
            : 'Hover with mouse to understand what are selected for plate';
        while (!cancelled()) {
            gameState.blocks.forEach(b => b.el.classList.remove(
                UI_CLASSES.SELECTED, UI_CLASSES.LINKED, UI_CLASSES.RINKED, UI_CLASSES.TOUCHED
            ));
            await stepSleep(500);
            if (cancelled()) break;

            if (gameState.blocks.length < 3) {
                await stepSleep(1000);
                continue;
            }

            const [p1, p2, p3] = gameState.blocks;
            const btn1 = gameState.isMobile ? inspectorRow.children[0] : null;

            if (btn1) {
                positionArrowRelative(btn1, 10, -40);
            } else {
                positionArrowRelative(p1.el, 10, -50);
            }
            await stepSleep(800);
            if (cancelled()) break;

            if (btn1) btn1.style.background = '#555';
            p1.el.classList.add(UI_CLASSES.TOUCHED);
            p2.el.classList.add(UI_CLASSES.LINKED);
            p3.el.classList.add(UI_CLASSES.RINKED);
            await stepSleep(2000);
            if (cancelled()) break;

            if (btn1) btn1.style.background = btn1.dataset.defaultBg || '';
            p1.el.classList.remove(UI_CLASSES.TOUCHED);
            p2.el.classList.remove(UI_CLASSES.LINKED);
            p3.el.classList.remove(UI_CLASSES.RINKED);
            tutorialArrow.style.display = 'none';
            await stepSleep(1000);
        }
    },

    async stepControls(cancelled) {
        clean();
        tutorialText.textContent = gameState.isMobile
            ? 'You can walk step-by-step by pressing step controls. If you hold it, it will move plates state-by-state.'
            : 'Walk the solution with the step buttons, or with SPACE forward and CTRL+SPACE back. A tap moves a single step, holding it moves plates state-by-state. With squashed checked, every tap already goes state-to-state.';
        resetBtn.click();
        await stepSleep(200);
        if (cancelled()) return;

        const hardState = [HOLE_SPACING * 2, -HOLE_SPACING, HOLE_SPACING * 3, -HOLE_SPACING * 2, HOLE_SPACING, -HOLE_SPACING];
        gameState.blocks.forEach((b, i) => {
            // TODO: slight bug — the first pin move disappears
            updateBlockState(b, {x: hardState[i] || 0, transition: 'transform 0.5s ease', pinTime: 400});
        });
        await stepSleep(600);
        if (cancelled()) return;

        solveBtn.click();
        while (solveBtn.disabled && !cancelled()) await stepSleep(200);
        if (cancelled()) return;

        const demoStepKey = async (hotkey) => {
            positionArrowRelative(hotkey.btn, 15, -40);
            showHotkey(hotkey);
            await stepSleep(600);
            for (let i = 0; i < 3 && !cancelled(); i++) {
                await pressHotkey(hotkey, 140);
                await stepSleep(700);
            }
            if (cancelled()) return;
            await pressHotkey(hotkey, HOLD_STEP_DURATION + 250);
            await stepSleep(900);
        };

        const demoClicks = async (btn, times, delay) => {
            positionArrowRelative(btn, 15, -40);
            await stepSleep(600);
            if (cancelled()) return;
            for (let i = 0; i < times && !cancelled(); i++) {
                btn.click();
                await stepSleep(delay);
            }
        };

        while (!cancelled()) {
            if (gameState.isMobile) {
                await demoClicks(nextBtn, 2, 600);
                if (cancelled()) break;
                await simulateHold(nextBtn, 1500);
                await stepSleep(800);
                if (cancelled()) break;

                await demoClicks(prevBtn, 2, 600);
                if (cancelled()) break;
                await simulateHold(prevBtn, 1500);
                await stepSleep(800);
            } else {
                jumpToStep(1);
                await demoStepKey(HOTKEYS.next);
                if (cancelled()) break;
                await demoStepKey(HOTKEYS.prev);
            }
        }
    },

    async resetHotkeys(cancelled) {
        clean();
        tutorialText.textContent = 'BACKSPACE rewinds a solved sequence back to its first step. CTRL+BACKSPACE clears the lock itself, so you can set up a new one.';

        const messy = [HOLE_SPACING, -HOLE_SPACING * 2, HOLE_SPACING * 2, -HOLE_SPACING, HOLE_SPACING * 3, -HOLE_SPACING];

        while (!cancelled()) {
            gameState.blocks.forEach((b, i) => {
                updateBlockState(b, {x: messy[i] || 0, transition: 'transform 0.5s ease', pinTime: 400});
            });
            await stepSleep(700);
            if (cancelled()) break;

            solveBtn.click();
            while (solveBtn.disabled && !cancelled()) await stepSleep(200);
            if (cancelled()) break;

            for (let i = 0; i < 4 && !cancelled(); i++) {
                nextBtn.click();
                await stepSleep(450);
            }
            if (cancelled()) break;

            positionArrowRelative(restartSeqBtn, 10, -40);
            showHotkey(HOTKEYS.restart);
            await stepSleep(900);
            if (cancelled()) break;

            await pressHotkey(HOTKEYS.restart, 160);
            await stepSleep(1600);
            if (cancelled()) break;

            positionArrowRelative(resetBtn, 15, -40);
            showHotkey(HOTKEYS.reset);
            await stepSleep(900);
            if (cancelled()) break;

            await pressHotkey(HOTKEYS.reset, 160);
            hideArrows();
            hideHotkey();
            await stepSleep(1600);
        }
    },

    async searchCount(cancelled) {
        clean();
        tutorialSearchDemo = true;
        tutorialText.textContent = 'The counter shows how many saved locks match your current lock. Watch it update as the plates change.';

        while (!cancelled()) {
            if (6 !== +countInput.value) {
                countInput.value = 6;
                renderBlocks();
            }
            resetBtn.click();
            refreshMatches();
            positionArrowRelative(searchToggle, 15, -40);
            await stepSleep(1500);
            if (cancelled()) break;

            const demoStates = [
                [HOLE_SPACING, 0, 0, 0, 0, 0],
                [HOLE_SPACING, -HOLE_SPACING, 0, 0, 0, 0],
                [HOLE_SPACING, -HOLE_SPACING, HOLE_SPACING * 2, 0, 0, 0],
                [0, 0, 0, 0, 0, 0]
            ];
            for (const positions of demoStates) {
                if (cancelled()) break;
                gameState.blocks.forEach((b, i) => {
                    updateBlockState(b, {x: positions[i] || 0, transition: 'transform 0.5s ease', pinTime: 400});
                });
                refreshMatches();
                await stepSleep(1500);
            }
        }

        tutorialSearchDemo = false;
    },

    async searchPick(cancelled) {
        clean();
        tutorialSearchDemo = true;
        tutorialText.textContent = 'Press the counter to open the list of matching locks and pick one to load its saved state.';

        while (!cancelled()) {
            setSearchOpen(false);
            if (6 !== +countInput.value) {
                countInput.value = 6;
                renderBlocks();
            }
            resetBtn.click();
            refreshMatches();
            await stepSleep(800);
            if (cancelled()) break;

            positionArrowRelative(searchToggle, 15, -40);
            await stepSleep(1000);
            if (cancelled()) break;

            pressButtonVisual(searchToggle);
            await stepSleep(150);
            releaseButtonVisual(searchToggle);
            tutorialArrow.style.display = 'none';
            setSearchOpen(true);
            searchPanel.classList.toggle('is-open', false);
            searchPanel.classList.toggle('is-open-tutorial', true);
            await stepSleep(800);
            if (cancelled()) break;

            const firstItem = searchList.querySelector('.search-item');
            if (firstItem) {
                positionArrowRelative(firstItem, 10, -40);
                await stepSleep(1000);
                firstItem.click();
                searchPanel.classList.toggle('is-open-tutorial', false);
                if (cancelled()) break;

                tutorialArrow.style.display = 'none';
                await stepSleep(2500);
            } else {
                await stepSleep(2000);
                setSearchOpen(false);
            }
            if (cancelled()) break;
            await stepSleep(1000);
        }

        updateMatchCount([])
        tutorialSearchDemo = false;
        setSearchOpen(false);
    },

    async autoPlay(cancelled) {
        clean();
        tutorialText.textContent = 'You can play the whole sequence automatically. Press the play button.';
        while (!cancelled()) {
            resetBtn.click();
            await stepSleep(400);
            if (cancelled()) break;

            const playState = [-HOLE_SPACING * 2, HOLE_SPACING * 2, -HOLE_SPACING, HOLE_SPACING, 0, -HOLE_SPACING];
            gameState.blocks.forEach((b, i) => {
                updateBlockState(b, {x: playState[i] || 0, transition: 'transform 0.5s ease', pinTime: 400});
            });
            await stepSleep(800);
            if (cancelled()) break;

            solveBtn.click();
            while (solveBtn.disabled && !cancelled()) await stepSleep(200);
            if (cancelled()) break;

            positionArrowRelative(playBtn, 15, -40);
            await stepSleep(800);
            if (cancelled()) break;

            playBtn.click();
            tutorialArrow.style.display = 'none';
            await stepSleep(3000);
        }
    },

    async share(cancelled) {
        clean();
        tutorialText.textContent = 'You can share your current lock with others by pressing the share button. Better if u share it in steam guide with comment where it stands for feature database';
        while (!cancelled()) {
            positionArrowRelative(shareBtn, 15, -40);
            positionArrowRelative(steamGuideBtn, 15, -40, tutorialArrow2);
            await stepSleep(2000);
        }
    },

    async about(cancelled) {
        clean();
        tutorialText.textContent = 'That is the whole tool. The rest is written up here - close the panel when you are done.';
        setAboutOpen(true);
        while (!cancelled()) await stepSleep(500);
    }
};

async function runTutorialStep(version) {
    clean();

    const step = TUTORIAL_STEPS[currentStepName()];
    if (!step) {
        endTutorial();
        return;
    }

    const cancelled = () => version !== currentTutorialVersion;
    await step(cancelled);
}