import { FOLD_DURATION, STEP_DURATION } from './config.js';
import { buildRoadGraph, findPath, keyOf, validateFold } from './folding.js';
import { LEVELS } from './levels.js';

const key = (cell) => keyOf(cell);
const sameCell = (a, b) => a.c === b.c && a.r === b.r;

export function createWorld(startLevel = 0) {
  const state = {
    screen: 'title', levelIndex: startLevel, foldedPanels: new Set(), selectedPanelId: null,
    courier: null, taskIndex: 0, carrying: false, delivered: 0, moves: 0, folds: 0,
    elapsed: 0, totalScore: 0, levelScore: 0, scoreBreakdown: null,
    moveTween: null, foldTween: null, message: '', messageTime: 0, graph: null, tiles: null,
  };
  const level = () => LEVELS[state.levelIndex];

  function rebuild() {
    ({ graph: state.graph, tiles: state.tiles } = buildRoadGraph(level(), state.foldedPanels));
  }

  function say(message, duration = 3) {
    state.message = message; state.messageTime = duration;
  }

  function resetLevel(index = state.levelIndex, screen = 'title') {
    state.levelIndex = index;
    state.screen = screen;
    state.foldedPanels = new Set();
    state.selectedPanelId = null;
    state.courier = { ...level().start };
    state.taskIndex = 0; state.carrying = false; state.delivered = 0;
    state.moves = 0; state.folds = 0; state.elapsed = 0; state.levelScore = 0;
    state.scoreBreakdown = null; state.moveTween = null; state.foldTween = null;
    state.message = screen === 'title' ? `Welcome to ${level().title}. ${level().tutorial}` : level().tutorial;
    state.messageTime = 0;
    rebuild();
  }

  function currentTask() { return level().tasks[state.taskIndex]; }

  function collectIfHere() {
    const task = currentTask();
    if (!state.carrying && task && sameCell(state.courier, task.parcel)) {
      state.carrying = true;
      say(`Parcel ${state.taskIndex + 1} of ${level().tasks.length} aboard. ${level().routeHint}`);
    }
  }

  function begin() {
    if (state.screen !== 'title') return;
    state.screen = 'play';
    collectIfHere();
    if (!state.carrying) say(level().tutorial);
  }

  function restart() {
    if ((state.screen === 'result' || state.screen === 'complete') && state.levelScore > 0) {
      state.totalScore = Math.max(0, state.totalScore - state.levelScore);
    }
    resetLevel(state.levelIndex, 'play');
    collectIfHere();
    say(`${level().title} restarted. ${level().tutorial}`);
  }

  function replayGame() {
    state.totalScore = 0;
    resetLevel(0, 'play');
    collectIfHere();
    say('A fresh city tour. ' + level().tutorial);
  }

  function canTransition(panelId, folded) {
    const panel = level().panels.find((entry) => entry.id === panelId);
    if (!panel) return { ok: false, reason: 'That crease is not part of this city.' };
    const nextFolded = new Set(state.foldedPanels);
    if (folded) nextFolded.add(panelId); else nextFolded.delete(panelId);
    const next = buildRoadGraph(level(), nextFolded);
    const courierKey = key(state.courier);
    if (!next.tiles.has(courierKey)) {
      return { ok: false, reason: 'The fold would carry the courier with that flap. Step onto a fixed street first.' };
    }
    if (!(next.graph.get(courierKey)?.length)) {
      return { ok: false, reason: 'That fold would leave the courier without a connected street.' };
    }
    if (folded) {
      const validation = validateFold(level(), panelId, state.foldedPanels);
      if (!validation.ok) return validation;
    }
    return { ok: true, nextFolded, next };
  }

  function toggleFold(panelId = state.selectedPanelId) {
    if (!panelId || state.foldTween || state.screen !== 'play') return;
    const folded = !state.foldedPanels.has(panelId);
    const validation = canTransition(panelId, folded);
    if (!validation.ok) { say(validation.reason); return; }
    state.foldTween = {
      panelId, fromFolded: !folded, toFolded: folded,
      elapsed: 0, duration: FOLD_DURATION,
    };
    state.selectedPanelId = null;
    say(folded ? 'Folding the panel across its crease…' : 'Unfolding the panel to its original grid…', FOLD_DURATION);
  }

  function handleSeamClick(panelId) {
    if (state.screen !== 'play' || state.foldTween) return;
    if (!panelId) { state.selectedPanelId = null; return; }
    if (state.selectedPanelId === panelId) toggleFold(panelId);
    else {
      state.selectedPanelId = panelId;
      const panel = level().panels.find((entry) => entry.id === panelId);
      say(`${panel.label} selected. Click that crease again to ${state.foldedPanels.has(panelId) ? 'unfold' : 'fold'}.`);
    }
  }

  function completeLevel() {
    const remaining = Math.max(0, level().timeLimit - state.elapsed);
    const timeBonus = Math.floor(remaining * 8);
    const routeBonus = Math.max(0, level().parMoves - state.moves) * 15;
    const foldBonus = Math.max(0, 160 - state.folds * 40);
    state.scoreBreakdown = { base: 350, time: timeBonus, route: routeBonus, fold: foldBonus };
    state.levelScore = state.scoreBreakdown.base + timeBonus + routeBonus + foldBonus;
    state.totalScore += state.levelScore;
    state.screen = state.levelIndex === LEVELS.length - 1 ? 'complete' : 'result';
    say(state.screen === 'complete' ? 'Every parcel delivered. The whole city is connected!' : `${level().title} complete. Review the score, then continue.`, 999);
  }

  function finishMove() {
    state.courier = state.moveTween.to;
    state.moveTween = null;
    collectIfHere();
    if (!state.carrying || !sameCell(state.courier, currentTask().destination)) return;
    state.delivered += 1;
    state.carrying = false;
    if (state.delivered >= level().tasks.length) { completeLevel(); return; }
    state.taskIndex += 1;
    const next = currentTask();
    if (sameCell(state.courier, next.parcel)) {
      state.carrying = true;
      say(`Parcel 1 delivered! Parcel ${state.taskIndex + 1} of ${level().tasks.length} aboard. New drop marked ${state.taskIndex + 1}.`);
    } else {
      say(`Parcel ${state.delivered} delivered! Find parcel ${state.taskIndex + 1}, then follow its numbered drop.`);
    }
  }

  function requestMove(direction) {
    if (state.screen !== 'play' || state.moveTween || state.foldTween) return;
    const fromKey = key(state.courier);
    const neighbors = state.graph.get(fromKey) ?? [];
    const delta = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] }[direction];
    if (!delta) return;
    const to = { c: state.courier.c + delta[0], r: state.courier.r + delta[1] };
    if (!neighbors.includes(key(to))) {
      say('No joined road that way. Look for two matching lane marks.', 1.5);
      return;
    }
    state.moveTween = { from: { ...state.courier }, to, elapsed: 0, duration: STEP_DURATION };
    state.moves += 1;
  }

  function update(dt) {
    if (state.screen === 'paused') return;
    if (state.screen === 'play') {
      state.elapsed += dt;
      if (state.elapsed >= level().timeLimit) {
        state.elapsed = level().timeLimit;
        state.screen = 'lost'; state.moveTween = null; state.foldTween = null; state.selectedPanelId = null;
        say('The courier ran out of time. Press R to retry this city.', 999);
        return;
      }
    }
    if (state.messageTime > 0) state.messageTime = Math.max(0, state.messageTime - dt);
    if (state.moveTween) {
      state.moveTween.elapsed += dt;
      if (state.moveTween.elapsed >= state.moveTween.duration) finishMove();
    }
    if (state.foldTween) {
      state.foldTween.elapsed += dt;
      if (state.foldTween.elapsed >= state.foldTween.duration) {
        const { panelId, toFolded } = state.foldTween;
        if (toFolded) state.foldedPanels.add(panelId); else state.foldedPanels.delete(panelId);
        state.foldTween = null;
        rebuild();
        if (toFolded) state.folds += 1;
        const destination = currentTask()?.destination;
        const path = destination ? findPath(state.graph, state.courier, destination) : null;
        const panel = level().panels.find((entry) => entry.id === panelId);
        if (toFolded && !path) say(`${panel.label} folded safely, but this side lane still does not reach the active drop. Try another crease.`, 5);
        else say(toFolded ? `${panel.label} joined the street. Follow the matching ports to drop ${state.taskIndex + 1}.` : 'The panel returned to its exact original paper grid.');
      }
    }
  }

  function pauseToggle() {
    if (state.screen === 'play') { state.screen = 'paused'; say('City paused.', 999); }
    else if (state.screen === 'paused') { state.screen = 'play'; say('Back to the route.'); }
  }

  function nextLevel() {
    if (state.screen !== 'result' || state.levelIndex >= LEVELS.length - 1) return;
    resetLevel(state.levelIndex + 1, 'play');
    say(`${level().title}. ${level().tutorial}`);
  }

  function replayFromEnd() {
    if (state.screen === 'complete') replayGame();
  }

  resetLevel(startLevel, 'title');
  return { state, level, begin, restart, replayGame, replayFromEnd, nextLevel, update, requestMove, handleSeamClick, pauseToggle };
}
