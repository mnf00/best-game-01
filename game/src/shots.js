import { findPath } from './folding.js';

const directionFor = (from, to) => to[0] > from[0] ? 'E' : to[0] < from[0] ? 'W' : to[1] > from[1] ? 'S' : 'N';

function moveTo(world, target) {
  const path = findPath(world.state.graph, world.state.courier, target);
  if (!path) throw new Error(`Screenshot route has no path to ${target.c},${target.r}`);
  for (let index = 1; index < path.length; index += 1) {
    world.requestMove(directionFor(path[index - 1], path[index]));
    world.update(.24);
  }
}

function foldSolutions(world) {
  for (const id of world.level().solutionPanels) {
    world.handleSeamClick(id);
    world.handleSeamClick(id);
    world.update(.8);
  }
}

function stageMessage(world, message, duration = 20) {
  world.state.message = message;
  world.state.messageTime = duration;
}

function solveCurrentLevel(world) {
  foldSolutions(world);
  while (world.state.screen === 'play') {
    const task = world.level().tasks[world.state.taskIndex];
    if (!world.state.carrying) moveTo(world, task.parcel);
    moveTo(world, task.destination);
  }
}

function solveWholeGame(world) {
  world.begin();
  for (;;) {
    solveCurrentLevel(world);
    if (world.state.screen === 'complete') break;
    world.nextLevel();
  }
}

export function stageShot(name, world) {
  if (!name || name === 'start') return;
  world.begin();
  if (name === 'complete') { solveWholeGame(world); return; }

  if (name === 'play' && world.state.levelIndex === 2) {
    moveTo(world, world.level().tasks[0].parcel);
    foldSolutions(world);
    moveTo(world, { c: 2, r: 3 });
    world.state.elapsed = 38;
    stageMessage(world, 'The bridge is holding. Follow the lane north to the raised drop.');
    return;
  }

  if (name === 'double' && world.state.levelIndex === 3) {
    foldSolutions(world);
    moveTo(world, world.level().tasks[0].parcel);
    moveTo(world, world.level().tasks[0].destination);
    moveTo(world, world.level().tasks[1].parcel);
    world.state.elapsed = 82;
    stageMessage(world, 'Parcel 2 aboard. Return over the folded crossing to drop 2.');
    return;
  }

  if (name === 'end' || name === 'play') {
    solveCurrentLevel(world);
    return;
  }
  throw new Error(`Unknown screenshot scene: ${name}`);
}
