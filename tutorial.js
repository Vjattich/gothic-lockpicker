'use strict';
const
    tutorialOverlay = document.getElementById('tutorialOverlay'),
    tutorialBubble = document.getElementById('tutorialBubble'),
    tutorialText = document.getElementById('tutorialText'),
    tutorialArrow = document.getElementById('tutorialArrow'),
    tutorialArrow2 = document.getElementById('tutorialArrow2'),
    questionMarkBtn = document.querySelector('.question-mark'),
    iconQm = document.getElementById('icon-qm'),
    iconX = document.getElementById('icon-x'),
    guidePrev = document.getElementById('guidePrev'),
    guideNext = document.getElementById('guideNext'),
    footer = document.getElementById('footer');

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

function advanceTutorial() {
    currentTutorialVersion++;
    wakeUpSleep();
    setTimeout(() => runTutorialStep(currentTutorialVersion), 0);
}

function startTutorial() {
    updateMatchCount([]);
    isGuideActive = true;
    document.body.classList.add('tutorial-active');
    resetBtn.click();
    tutorialOverlay.style.display = 'block';
    tutorialBubble.style.display = 'block';
    guidePrev.style.display = 'flex';
    guideNext.style.display = 'flex';
    iconQm.style.display = 'none';
    iconX.style.display = 'block';
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
    document.body.classList.remove('tutorial-active');
    currentTutorialVersion++;
    wakeUpSleep();
    tutorialOverlay.style.display = 'none';
    tutorialBubble.style.display = 'none';
    hideArrows();
    guidePrev.style.display = 'none';
    guideNext.style.display = 'none';
    iconQm.style.display = 'block';
    iconX.style.display = 'none';
    resetBtn.click();
    footer.style.zIndex = '1';
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

    [nextBtn, prevBtn].forEach(btn => {
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
 */
const TUTORIAL_ORDER = [
    'zoom',
    'dragPlates',
    'adjustPlates',
    'groupPlates',
    'inspectGroups',
    'stepControls',
    'searchCount',
    'searchPick',
    'autoPlay',
    'share'
];

function currentStepName() {
    return TUTORIAL_ORDER[tutorialStep - 1];
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
            : 'If squashed is checked, plates will go from state-to-state. Without squashed, you can walk single steps.';
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
                await demoClicks(nextBtn, 3, 800);
                if (cancelled()) break;
                await demoClicks(prevBtn, 3, 800);
            }
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
            await stepSleep(1000);
            if (cancelled()) break;

            const firstItem = searchList.querySelector('.search-item');
            if (firstItem) {
                positionArrowRelative(firstItem, 10, -40);
                await stepSleep(1200);
                if (cancelled()) break;

                tutorialArrow.style.display = 'none';
                await stepSleep(3500);
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