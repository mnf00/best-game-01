import { createInput } from './input.js';
import { createWorld } from './world.js';
import { createRenderer } from './render.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const requestedLevel = Number.parseInt(params.get('level') ?? '1', 10);
const initialLevel = shot ? Math.max(0, Math.min(3, requestedLevel - 1)) : 0;
const world = createWorld(initialLevel);
const input = createInput(canvas);
const renderer = createRenderer(canvas);
const STEP = 1 / 60;
let accumulator = 0;
let previous = performance.now();
let lastAnnouncement = '';

function announce() {
  const next = `${world.state.screen}. ${world.state.message}`;
  if (next !== lastAnnouncement) { status.textContent = next; lastAnnouncement = next; }
}

function controls() {
  const action = input.take();
  if (action.restart) { world.restart(); announce(); return; }
  if (action.pause) { world.pauseToggle(); announce(); }
  if (action.escape) {
    if (world.state.screen === 'paused') world.pauseToggle();
    else if (world.state.selected) { world.state.selected = false; world.say('Crease selection cleared.'); }
    else world.pauseToggle();
    announce();
  }
  if (action.start) {
    if (world.state.screen === 'title') world.begin();
    else if (world.state.screen === 'result') world.nextLevel();
    else if (world.state.screen === 'complete') world.replayFromEnd();
    else if (world.state.screen === 'lost') world.restart();
    announce();
  }
  if (action.pointer) {
    if (world.state.screen === 'title') { world.begin(); announce(); }
    else if (world.state.screen === 'paused') { world.pauseToggle(); announce(); }
    else if (world.state.screen === 'play') {
      world.handleSeamClick(renderer.seamHit(action.pointer, world.level())); announce();
    } else if (world.state.screen === 'result') {
      if (renderer.buttonHit(action.pointer, world.state) === 'next') world.nextLevel();
      announce();
    } else if (world.state.screen === 'complete') {
      if (renderer.buttonHit(action.pointer, world.state) === 'replay') world.replayFromEnd();
      announce();
    }
  }
  if (action.move) { world.requestMove(action.move); announce(); }
}

function frame(now) {
  const elapsed = Math.min((now - previous) / 1000, 0.2);
  previous = now; accumulator += elapsed;
  if (!shot) {
    controls();
    while (accumulator >= STEP) { world.update(STEP); accumulator -= STEP; }
    announce();
  }
  renderer.draw(world.state, now);
  if (shot && !window.__shotReady) window.__shotReady = true;
  requestAnimationFrame(frame);
}

stageShot(shot, world);
announce(); requestAnimationFrame(frame);
