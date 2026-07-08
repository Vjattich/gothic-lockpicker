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
    isGuideActive = false,
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

questionMarkBtn.addEventListener('click', () => {
    if (isGuideActive) {
        endTutorial();
    } else {
        startTutorial();
    }
});

function positionArrowRelative(target, offsetX = 0, offsetY = 0, arrowElement = tutorialArrow) {
    if (!target) return;
    const rect = target.getBoundingClientRect();
    arrowElement.style.top = `${rect.top + offsetY}px`;
    arrowElement.style.left = `${rect.left + offsetX}px`;
    arrowElement.style.display = 'block';
}

guidePrev.addEventListener('click', () => {
    if (tutorialStep > 1) {
        tutorialStep--;
        currentTutorialVersion++;
        wakeUpSleep();
        setTimeout(() => runTutorialStep(currentTutorialVersion), 0);
    }
});

guideNext.addEventListener('click', () => {
    tutorialStep++;
    currentTutorialVersion++;
    wakeUpSleep();
    setTimeout(() => runTutorialStep(currentTutorialVersion), 0);
});

function startTutorial() {
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
    currentTutorialVersion++;
    wakeUpSleep();
    setTimeout(() => runTutorialStep(currentTutorialVersion), 0);
    footer.style.zIndex = '1001';
    if (gameState.isMobile) {
        controls.style.transition = 'top 0.4s ease-out';
        controls.style.top = '55%';
    }
}

function endTutorial() {
    isGuideActive = false;
    document.body.classList.remove('tutorial-active');
    currentTutorialVersion++;
    wakeUpSleep();
    tutorialOverlay.style.display = 'none';
    tutorialBubble.style.display = 'none';
    tutorialArrow.style.display = 'none';
    tutorialArrow2.style.display = 'none'
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
    tutorialArrow.style.display = 'none';
    tutorialArrow2.style.display = 'none';

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
        if (btn) {
            btn.style.transform = '';
            btn.style.filter = '';
            btn.dispatchEvent(new Event('pointerup'));
            btn.dispatchEvent(new Event('mouseup'));
            btn.dispatchEvent(new Event('touchend'));
        }
    });

    if (6 !== +countInput.value && 3 !== tutorialStep) {
        countInput.value = 6;
        renderBlocks();
    }
}


async function runTutorialStep(version) {

    clean();

    if (1 === tutorialStep) {

        clean();

        tutorialText.textContent = gameState.isMobile
            ? 'Use a two-finger pinch gesture on the screen to zoom in or out.'
            : 'Use the slider to adjust zooming.';

        const baseScale = sizeInput ? parseFloat(sizeInput.value) : 1;

        while (version === currentTutorialVersion) {
            for (let i = 0; i <= 20; i++) {
                if (version !== currentTutorialVersion) break;
                let currentScale = baseScale + (i / 20) * 0.2;
                document.documentElement.style.setProperty('--block-scale', currentScale.toFixed(2));
                if (sizeInput) sizeInput.value = currentScale;
                await stepSleep(40);
            }

            await stepSleep(500);
            if (version !== currentTutorialVersion) break;
            for (let i = 0; i <= 20; i++) {
                if (version !== currentTutorialVersion) break;
                let currentScale = (baseScale + 0.2) - (i / 20) * 0.2;
                document.documentElement.style.setProperty('--block-scale', currentScale.toFixed(2));
                if (sizeInput) sizeInput.value = currentScale;
                await stepSleep(40);
            }

            await stepSleep(1000);
        }

        document.documentElement.style.setProperty('--block-scale', baseScale);
        if (sizeInput) sizeInput.value = baseScale;

    } else if (2 === tutorialStep) {
        clean();
        tutorialText.textContent = 'You can drag selected plates left or right.';
        let plateIndex = 0;
        while (version === currentTutorialVersion) {
            gameState.blocks.forEach(b => b.el.querySelector('.front-face').style.borderColor = '');
            if (gameState.blocks.length > 0) {
                const plate = gameState.blocks[plateIndex % gameState.blocks.length].el;
                plate.querySelector('.front-face').style.borderColor = 'white';
                plateIndex++;
            }
            await stepSleep(600);
        }
    } else if (3 === tutorialStep) {
        tutorialText.textContent = 'Adjust plates like in a game: plates count and plates position.';
        while (version === currentTutorialVersion) {
            if (6 !== +countInput.value) {
                countInput.value = 6;
                renderBlocks();
            }
            await stepSleep(500);
            if (version !== currentTutorialVersion) break;
            positionArrowRelative(btnIncrease, 15, -40);
            await stepSleep(600);
            if (version !== currentTutorialVersion) break;
            for (let i = 0; i < 2; i++) {
                btnIncrease.click();
                await stepSleep(600);
                if (version !== currentTutorialVersion) break;
            }
            if (version !== currentTutorialVersion) break;
            positionArrowRelative(btnDecrease, 15, -40);
            await stepSleep(600);
            if (version !== currentTutorialVersion) break;
            for (let i = 0; i < 2; i++) {
                btnDecrease.click();
                await stepSleep(600);
                if (version !== currentTutorialVersion) break;
            }
            if (version !== currentTutorialVersion) break;
            tutorialArrow.style.display = 'none';
            await stepSleep(400);

            const presets = [[-HOLE_SPACING, HOLE_SPACING, -HOLE_SPACING * 2, 0, HOLE_SPACING * 2, 0], [HOLE_SPACING * 2, -HOLE_SPACING, 0, HOLE_SPACING, -HOLE_SPACING * 2, HOLE_SPACING], [0, 0, HOLE_SPACING * 3, -HOLE_SPACING * 3, HOLE_SPACING, -HOLE_SPACING]];
            let pIndex = 0;
            while (pIndex < 3) {
                const positions = presets[pIndex % presets.length];
                gameState.blocks.forEach((b, i) => {
                    updateBlockState(b, {x: positions[i] || 0, transition: 'transform 0.5s ease', pinTime: 400})
                });
                pIndex++;
                await stepSleep(1500);
            }
            clean();
            await stepSleep(1000);
        }
    } else if (4 === tutorialStep) {
        clean();
        tutorialText.textContent = 'Long-press to group plates. Blue moves with it, Red opposite. Tap again to deselect.';
        while (version === currentTutorialVersion) {
            clean();
            await stepSleep(1200);
            if (version !== currentTutorialVersion) break;
            if (gameState.blocks.length >= 3) {
                const p1 = gameState.blocks[0], p2 = gameState.blocks[1], p3 = gameState.blocks[2];
                p1.el.classList.add(UI_CLASSES.SELECTED);
                await stepSleep(800);
                if (version !== currentTutorialVersion) break;
                positionArrowRelative(p2.el, 10, -50);
                await stepSleep(600);
                p2.el.classList.add(UI_CLASSES.LINKED);
                await stepSleep(800);
                if (version !== currentTutorialVersion) break;
                positionArrowRelative(p3.el, 10, -50);
                await stepSleep(600);
                p3.el.classList.add(UI_CLASSES.RINKED);
                await stepSleep(800);
                if (version !== currentTutorialVersion) break;
                tutorialArrow.style.display = 'none';
                let offset = 0,
                    direction = 1;
                const maxLimit = HOLE_SPACING * 1.5,
                    totalFrames = 180;
                for (let i = 0; i <= totalFrames; i++) {
                    if (version !== currentTutorialVersion) break;
                    let progress = i / totalFrames,
                        offset = Math.sin(progress * Math.PI * 2) * maxLimit;
                    [{b: p1, dir: 1}, {b: p2, dir: 1}, {b: p3, dir: -1}].forEach(item => {
                        updateBlockState(item.b, {
                            x: offset * item.dir,
                            transition: 'none',
                            pinTransition: 'transform 0.03s ease-out'
                        })
                    });

                    await stepSleep(16);
                }

            } else await stepSleep(1000);
        }
    } else if (5 === tutorialStep) {
        clean();
        tutorialText.textContent = gameState.isMobile
            ? 'Touch the number row to see what groups are selected for plate'
            : 'Hover with mouse to understand what are selected for plate';
        while (version === currentTutorialVersion) {
            gameState.blocks.forEach(b => b.el.classList.remove(UI_CLASSES.SELECTED, UI_CLASSES.LINKED, UI_CLASSES.RINKED, UI_CLASSES.TOUCHED));
            await stepSleep(500);
            if (version !== currentTutorialVersion) break;
            if (gameState.blocks.length >= 3) {
                const p1 = gameState.blocks[0];
                const p2 = gameState.blocks[1];
                const p3 = gameState.blocks[2];
                if (gameState.isMobile) {
                    const btn1 = inspectorRow.children[0];
                    if (btn1) positionArrowRelative(btn1, 10, -40);
                } else positionArrowRelative(p1.el, 10, -50);
                await stepSleep(800);
                if (version !== currentTutorialVersion) break;
                if (gameState.isMobile) {
                    const btn1 = inspectorRow.children[0];
                    if (btn1) btn1.style.background = '#555';
                }
                p1.el.classList.add(UI_CLASSES.TOUCHED);
                p2.el.classList.add(UI_CLASSES.LINKED);
                p3.el.classList.add(UI_CLASSES.RINKED);
                await stepSleep(2000);
                if (version !== currentTutorialVersion) break;
                if (gameState.isMobile) {
                    const btn1 = inspectorRow.children[0];
                    if (btn1) btn1.style.background = btn1.dataset.defaultBg || '';
                }
                p1.el.classList.remove(UI_CLASSES.TOUCHED);
                p2.el.classList.remove(UI_CLASSES.LINKED);
                p3.el.classList.remove(UI_CLASSES.RINKED);
                tutorialArrow.style.display = 'none';
                await stepSleep(1000);
            } else await stepSleep(1000);
        }
    } else if (6 === tutorialStep) {
        clean();
        tutorialText.textContent = gameState.isMobile
            ? 'You can walk step-by-step by pressing step controls. If you hold it, it will move plates state-by-state.'
            : 'If squashed is checked, plates will go from state-to-state. Without squashed, you can walk single steps.';
        resetBtn.click();
        await stepSleep(200);
        if (version !== currentTutorialVersion) return;
        const hardState = [HOLE_SPACING * 2, -HOLE_SPACING, HOLE_SPACING * 3, -HOLE_SPACING * 2, HOLE_SPACING, -HOLE_SPACING];
        gameState.blocks.forEach((b, i) => {
            //todo a slight bug that dissapear first move of pin
            updateBlockState(b, {x: hardState[i] || 0, transition: 'transform 0.5s ease', pinTime: 400})
        });
        await stepSleep(600);
        if (version !== currentTutorialVersion) return;
        solveBtn.click();
        while (solveBtn.disabled && version === currentTutorialVersion) await stepSleep(200);
        if (version !== currentTutorialVersion) return;
        while (version === currentTutorialVersion) {
            if (gameState.isMobile) {
                positionArrowRelative(nextBtn, 15, -40);
                await stepSleep(600);
                if (version !== currentTutorialVersion) break;
                for (let i = 0; i < 2; i++) {
                    if (version !== currentTutorialVersion) break;
                    nextBtn.click();
                    await stepSleep(600);
                }
                if (version !== currentTutorialVersion) break;
                nextBtn.style.transform = 'scale(0.9)';
                nextBtn.style.filter = 'brightness(0.7)';
                nextBtn.dispatchEvent(new Event('pointerdown'));
                nextBtn.dispatchEvent(new Event('mousedown'));
                nextBtn.dispatchEvent(new Event('touchstart'));
                await stepSleep(1500);

                if (version !== currentTutorialVersion) break;

                nextBtn.dispatchEvent(new Event('pointerup'));
                nextBtn.dispatchEvent(new Event('mouseup'));
                nextBtn.dispatchEvent(new Event('touchend'));
                nextBtn.style.transform = '';
                nextBtn.style.filter = '';
                await stepSleep(800);
                if (version !== currentTutorialVersion) break;
                positionArrowRelative(prevBtn, 15, -40);
                await stepSleep(600);
                if (version !== currentTutorialVersion) break;
                for (let i = 0; i < 2; i++) {
                    if (version !== currentTutorialVersion) break;
                    prevBtn.click();
                    await stepSleep(600);
                }
                if (version !== currentTutorialVersion) break;
                prevBtn.style.transform = 'scale(0.9)';
                prevBtn.style.filter = 'brightness(0.7)';
                prevBtn.dispatchEvent(new Event('pointerdown'));
                prevBtn.dispatchEvent(new Event('mousedown'));
                prevBtn.dispatchEvent(new Event('touchstart'));
                await stepSleep(1500);
                prevBtn.dispatchEvent(new Event('pointerup'));
                prevBtn.dispatchEvent(new Event('mouseup'));
                prevBtn.dispatchEvent(new Event('touchend'));
                prevBtn.style.transform = '';
                prevBtn.style.filter = '';
                await stepSleep(800);
            } else {
                positionArrowRelative(nextBtn, 15, -40);
                await stepSleep(600);
                if (version !== currentTutorialVersion) break;
                for (let i = 0; i < 3; i++) {
                    if (version !== currentTutorialVersion) break;
                    nextBtn.click();
                    await stepSleep(800);
                }
                if (version !== currentTutorialVersion) break;
                positionArrowRelative(prevBtn, 15, -40);
                await stepSleep(600);
                if (version !== currentTutorialVersion) break;
                for (let i = 0; i < 3; i++) {
                    if (version !== currentTutorialVersion) break;
                    prevBtn.click();
                    await stepSleep(800);
                }
            }
        }
    } else if (7 === tutorialStep) {
        clean();
        tutorialText.textContent = 'You can play the whole sequence automatically. Press the play button.';
        while (version === currentTutorialVersion) {
            resetBtn.click();
            await stepSleep(400);
            if (version !== currentTutorialVersion) break;
            const playState = [-HOLE_SPACING * 2, HOLE_SPACING * 2, -HOLE_SPACING, HOLE_SPACING, 0, -HOLE_SPACING];
            gameState.blocks.forEach((b, i) => {
                updateBlockState(b, {x: playState[i] || 0, transition: 'transform 0.5s ease', pinTime: 400})
            });
            await stepSleep(800);
            if (version !== currentTutorialVersion) break;
            solveBtn.click();
            while (solveBtn.disabled && version === currentTutorialVersion) await stepSleep(200);
            if (version !== currentTutorialVersion) break;
            positionArrowRelative(playBtn, 15, -40);
            await stepSleep(800);
            if (version !== currentTutorialVersion) break;
            playBtn.click();
            tutorialArrow.style.display = 'none';
            await stepSleep(3000);
        }
    } else if (8 === tutorialStep) {
        clean();
        tutorialText.textContent = 'You can share your current lock with others by pressing the share button. Better if u share it in steam guide with comment where it stands for feature database';
        while (version === currentTutorialVersion) {
            positionArrowRelative(shareBtn, 15, -40);
            positionArrowRelative(steamGuideBtn, 15, -40, tutorialArrow2);
            await stepSleep(2000);
        }
    } else {
        endTutorial();
    }
}