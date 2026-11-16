import { BOARD } from './config.js';

export function keyOf(cell) { return `${cell.c},${cell.r}`; }

export function reflectCell(cell, panel) {
  const hinge = panel.hinge;
  if (hinge.axis === 'vertical') return { c: 2 * hinge.x - cell.c - 1, r: cell.r };
  return { c: cell.c, r: 2 * hinge.y - cell.r - 1 };
}

export function reflectPorts(ports, panel) {
  return ports.map((port) => {
    if (panel.hinge.axis === 'vertical') return port === 'E' ? 'W' : port === 'W' ? 'E' : port;
    return port === 'N' ? 'S' : port === 'S' ? 'N' : port;
  });
}

export function transformedPanel(panel) {
  return panel.cells.map((cell) => ({
    ...reflectCell(cell, panel),
    ports: reflectPorts(cell.ports ?? ['E', 'W'], panel),
    source: cell,
    panelId: panel.id,
  }));
}

function currentPanelCells(panel, foldedPanels) {
  return foldedPanels.has(panel.id) ? transformedPanel(panel) : panel.cells;
}

export function validateFold(level, panelId, foldedPanels = new Set()) {
  const panel = level.panels.find((entry) => entry.id === panelId);
  if (!panel) return { ok: false, reason: 'That crease is not part of this city.' };
  const reserved = new Set(level.buildings.map(keyOf));
  const receiving = new Set(panel.receivingCells.map(keyOf));
  const stationary = new Set(level.roads.map(keyOf));
  const occupiedByOtherPanels = new Set();
  for (const other of level.panels) {
    if (other.id === panel.id) continue;
    for (const cell of currentPanelCells(other, foldedPanels)) occupiedByOtherPanels.add(keyOf(cell));
  }
  const destinations = transformedPanel(panel);
  const seen = new Set();
  for (const cell of destinations) {
    const key = keyOf(cell);
    if (cell.c < 0 || cell.r < 0 || cell.c >= BOARD.columns || cell.r >= BOARD.rows) {
      return { ok: false, reason: 'That flap would slip off the city board.' };
    }
    if (!receiving.has(key)) return { ok: false, reason: 'That landing is outside the marked receiving area.' };
    if (reserved.has(key)) return { ok: false, reason: 'A reserved paper lot blocks that landing.' };
    if (stationary.has(key)) return { ok: false, reason: 'A street tile already occupies that landing.' };
    if (occupiedByOtherPanels.has(key)) return { ok: false, reason: 'Another paper panel occupies that landing.' };
    if (seen.has(key)) return { ok: false, reason: 'The folded tiles would overlap.' };
    seen.add(key);
  }
  if (seen.size !== receiving.size || [...receiving].some((key) => !seen.has(key))) {
    return { ok: false, reason: 'The panel does not fit the marked receiving area.' };
  }
  return { ok: true, cells: destinations };
}

export function buildRoadGraph(level, foldedPanels = new Set()) {
  const tiles = new Map();
  for (const tile of level.roads) tiles.set(keyOf(tile), { ...tile, ports: [...tile.ports], source: 'street' });
  for (const panel of level.panels) {
    for (const tile of currentPanelCells(panel, foldedPanels)) {
      const ports = tile.ports ?? ['E', 'W'];
      tiles.set(keyOf(tile), {
        ...tile,
        ports: foldedPanels.has(panel.id) ? [...tile.ports] : [...ports],
        source: 'panel',
        panelId: panel.id,
      });
    }
  }
  const graph = new Map([...tiles.keys()].map((key) => [key, []]));
  const directions = [
    { port: 'E', opposite: 'W', dc: 1, dr: 0 },
    { port: 'S', opposite: 'N', dc: 0, dr: 1 },
    { port: 'W', opposite: 'E', dc: -1, dr: 0 },
    { port: 'N', opposite: 'S', dc: 0, dr: -1 },
  ];
  for (let r = 0; r < BOARD.rows; r += 1) {
    for (let c = 0; c < BOARD.columns; c += 1) {
      const key = `${c},${r}`;
      const tile = tiles.get(key);
      if (!tile) continue;
      for (const direction of directions) {
        if (!tile.ports.includes(direction.port)) continue;
        const neighborKey = `${c + direction.dc},${r + direction.dr}`;
        const neighbor = tiles.get(neighborKey);
        if (neighbor?.ports.includes(direction.opposite)) graph.get(key).push(neighborKey);
      }
    }
  }
  return { graph, tiles };
}

export function findPath(graph, from, to) {
  const start = keyOf(from); const goal = keyOf(to);
  const queue = [start]; const parent = new Map([[start, null]]);
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (current === goal) break;
    for (const neighbor of graph.get(current) ?? []) {
      if (parent.has(neighbor)) continue;
      parent.set(neighbor, current); queue.push(neighbor);
    }
  }
  if (!parent.has(goal)) return null;
  const path = [];
  for (let current = goal; current !== null; current = parent.get(current)) path.push(current);
  return path.reverse().map((entry) => entry.split(',').map(Number));
}

export function validateLevel(level) {
  const roads = new Set(level.roads.map(keyOf));
  const reserved = new Set(level.buildings.map(keyOf));
  const start = keyOf(level.start);
  for (const cell of level.roads) {
    if (cell.c < 0 || cell.r < 0 || cell.c >= BOARD.columns || cell.r >= BOARD.rows) return `Road tile lies outside the city: ${keyOf(cell)}`;
  }
  for (const cell of level.buildings) {
    if (cell.c < 0 || cell.r < 0 || cell.c >= BOARD.columns || cell.r >= BOARD.rows) return `Building lies outside the city: ${keyOf(cell)}`;
  }
  if (level.roads.some((cell, index) => level.roads.findIndex((other) => keyOf(other) === keyOf(cell)) !== index)) {
    return 'Stationary road tiles overlap.';
  }
  if ([...roads].some((key) => reserved.has(key))) return 'A building overlaps a stationary road.';
  if (!roads.has(start)) return `Courier start is not on a stationary road: ${start}`;
  const objectCells = new Set([start]);
  for (const task of level.tasks) {
    for (const [kind, cell] of [['parcel', task.parcel], ['destination', task.destination]]) {
      const key = keyOf(cell);
      if (!roads.has(key)) return `${kind} is not on a stationary road: ${key}`;
      if (reserved.has(key)) return `${kind} overlaps a reserved building: ${key}`;
      if (objectCells.has(key)) return `${kind} overlaps another starting object: ${key}`;
      objectCells.add(key);
    }
  }
  const sourceCells = new Set(); const receivingCells = new Set();
  for (const panel of level.panels) {
    for (const cell of panel.cells) {
      const key = keyOf(cell);
      if (cell.c < 0 || cell.r < 0 || cell.c >= BOARD.columns || cell.r >= BOARD.rows) return `Panel source lies outside the city: ${key}`;
      if (roads.has(key) || reserved.has(key) || sourceCells.has(key)) return `Panel source overlaps city content: ${key}`;
      if (objectCells.has(key)) return `Panel source overlaps a courier, parcel, or drop: ${key}`;
      sourceCells.add(key);
    }
    const result = validateFold(level, panel.id);
    if (!result.ok) return `${panel.id}: ${result.reason}`;
    for (const cell of panel.receivingCells) {
      const key = keyOf(cell);
      if (receivingCells.has(key)) return `Panel receiving areas overlap: ${key}`;
      receivingCells.add(key);
      if (objectCells.has(key)) return `Panel receiving area overlaps a starting object: ${key}`;
    }
  }
  return null;
}
