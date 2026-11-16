import { BOARD, COLORS } from './config.js';
import { reflectCell, reflectPorts } from './folding.js';
import { LEVELS } from './levels.js';

const WIDTH = 1280;
const HEIGHT = 800;
const HALF_W = BOARD.tileWidth / 2;
const HALF_H = BOARD.tileHeight / 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function centerOf(cell) {
  return { x: BOARD.centerX + (cell.c - cell.r) * HALF_W, y: BOARD.topY + (cell.c + cell.r + 1) * HALF_H };
}

function gridPoint(c, r) {
  return { x: BOARD.centerX + (c - r) * HALF_W, y: BOARD.topY + (c + r) * HALF_H };
}

function hingePoints(panel) {
  const hinge = panel.hinge;
  return hinge.axis === 'vertical'
    ? [gridPoint(hinge.x, hinge.from), gridPoint(hinge.x, hinge.to)]
    : [gridPoint(hinge.from, hinge.y), gridPoint(hinge.to, hinge.y)];
}

function roundRect(ctx, x, y, width, height, radius, fill, stroke = null) {
  ctx.beginPath(); ctx.roundRect(x, y, width, height, radius);
  ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0, dpr: 1 };

  function resize() {
    const rect = canvas.getBoundingClientRect();
    view.dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(rect.width * view.dpr));
    const height = Math.max(1, Math.round(rect.height * view.dpr));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    view.scale = Math.min(canvas.width / WIDTH, canvas.height / HEIGHT);
    view.x = (canvas.width - WIDTH * view.scale) / 2;
    view.y = (canvas.height - HEIGHT * view.scale) / 2;
  }

  function screenToWorld(point) {
    return point ? { x: (point.x - view.x) / view.scale, y: (point.y - view.y) / view.scale } : null;
  }

  function seamHit(point, level) {
    const p = screenToWorld(point);
    if (!p) return null;
    let nearest = null; let nearestDistance = Infinity;
    for (const panel of level.panels) {
      const [a, b] = hingePoints(panel);
      const dx = b.x - a.x; const dy = b.y - a.y;
      const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy), 0, 1);
      const distance = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
      if (distance < 14 && distance < nearestDistance) { nearest = panel.id; nearestDistance = distance; }
    }
    return nearest;
  }

  function buttonHit(point, state) {
    const p = screenToWorld(point);
    if (!p) return null;
    if (state.screen === 'result' && p.x >= 478 && p.x <= 802 && p.y >= 505 && p.y <= 563) return 'next';
    if (state.screen === 'complete' && p.x >= 478 && p.x <= 802 && p.y >= 505 && p.y <= 563) return 'replay';
    return null;
  }

  function diamond(cell, fill, stroke, lift = 0) {
    const { x, y } = centerOf(cell);
    ctx.beginPath(); ctx.moveTo(x, y - HALF_H - lift); ctx.lineTo(x + HALF_W, y - lift);
    ctx.lineTo(x, y + HALF_H - lift); ctx.lineTo(x - HALF_W, y - lift); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
  }

  function drawBackdrop(time) {
    ctx.fillStyle = '#d8f1e8'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = 'rgba(255,255,255,.3)';
    for (let i = 0; i < 38; i += 1) {
      const x = (i * 181 + 27) % WIDTH; const y = (i * 97 + 19) % HEIGHT;
      ctx.beginPath(); ctx.ellipse(x, y, 1.2 + (i % 3) * 0.6, 1, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.save(); ctx.shadowColor = COLORS.shadow; ctx.shadowBlur = 24; ctx.shadowOffsetY = 14;
    ctx.beginPath(); ctx.moveTo(gridPoint(0, 0).x, gridPoint(0, 0).y);
    ctx.lineTo(gridPoint(BOARD.columns, 0).x, gridPoint(BOARD.columns, 0).y);
    ctx.lineTo(gridPoint(BOARD.columns, BOARD.rows).x, gridPoint(BOARD.columns, BOARD.rows).y);
    ctx.lineTo(gridPoint(0, BOARD.rows).x, gridPoint(0, BOARD.rows).y);
    ctx.closePath(); ctx.fillStyle = COLORS.paper; ctx.fill(); ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(265, 300 + Math.sin(time) * 2); ctx.bezierCurveTo(300, 280, 325, 320, 350, 298); ctx.stroke();
  }

  function drawTileGrid(level, state) {
    for (let r = 0; r < BOARD.rows; r += 1) {
      for (let c = 0; c < BOARD.columns; c += 1) {
        diamond({ c, r }, (c + r) % 2 ? COLORS.grass : COLORS.grass2, 'rgba(68,128,91,.25)');
      }
    }
    for (const panel of level.panels) {
      if (state.foldedPanels.has(panel.id) && state.foldTween?.panelId !== panel.id) continue;
      for (const cell of panel.receivingCells) {
        diamond(cell, 'rgba(255,255,255,.12)', 'rgba(58,154,117,.58)');
        const p = centerOf(cell);
        ctx.save(); ctx.setLineDash([4, 5]); ctx.strokeStyle = 'rgba(58,154,117,.58)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(p.x, p.y, 30, 12, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      }
    }
  }

  function portPoint(p, port) {
    const vectors = {
      N: [HALF_W / 2, -HALF_H / 2], E: [HALF_W / 2, HALF_H / 2],
      S: [-HALF_W / 2, HALF_H / 2], W: [-HALF_W / 2, -HALF_H / 2],
    };
    const [dx, dy] = vectors[port];
    return { x: p.x + dx, y: p.y + dy };
  }

  function drawRoad(cell, ports, surface = COLORS.road) {
    diamond(cell, surface, COLORS.roadEdge, 2);
    const p = centerOf(cell);
    for (const port of ports) {
      const edge = portPoint(p, port);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(edge.x, edge.y);
      ctx.lineCap = 'round'; ctx.strokeStyle = COLORS.roadEdge; ctx.lineWidth = 22; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(edge.x, edge.y);
      ctx.strokeStyle = '#f8d6a7'; ctx.lineWidth = 16; ctx.stroke();
      ctx.beginPath(); ctx.arc(edge.x, edge.y, 4.2, 0, Math.PI * 2); ctx.fillStyle = '#fff1cc'; ctx.fill();
    }
    ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2); ctx.fillStyle = '#fff1cc'; ctx.fill();
  }

  function drawBuilding(cell, variant = 0) {
    const p = centerOf(cell); const w = variant % 2 ? 46 : 52; const h = variant % 2 ? 38 : 48;
    ctx.save(); ctx.shadowColor = COLORS.shadow; ctx.shadowBlur = 7; ctx.shadowOffsetY = 6;
    ctx.fillStyle = ['#f28b70', '#f3bd61', '#92b6cc', '#bb9aca'][variant % 4];
    ctx.beginPath(); ctx.moveTo(p.x - w / 2, p.y - h / 2); ctx.lineTo(p.x, p.y - h / 2 - 21);
    ctx.lineTo(p.x + w / 2, p.y - h / 2); ctx.lineTo(p.x + w / 2, p.y + h / 2);
    ctx.lineTo(p.x - w / 2, p.y + h / 2); ctx.closePath(); ctx.fill(); ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,.42)';
    ctx.beginPath(); ctx.moveTo(p.x - w / 2, p.y - h / 2); ctx.lineTo(p.x, p.y - h / 2 - 21); ctx.lineTo(p.x, p.y + h / 2); ctx.lineTo(p.x - w / 2, p.y + h / 2); ctx.fill();
    roundRect(ctx, p.x - 5, p.y + 3, 10, 17, 3, '#775847');
    roundRect(ctx, p.x - w / 2 + 6, p.y - 4, 9, 9, 2, '#fff0bb');
  }

  function drawDecor(level) {
    level.buildings.forEach((cell, index) => drawBuilding(cell, index));
    for (const cell of [{ c: 2, r: 4 }, { c: 5, r: 4 }]) {
      const p = centerOf(cell);
      ctx.fillStyle = '#936d51'; ctx.fillRect(p.x - 3, p.y - 1, 6, 17);
      ctx.fillStyle = '#4d9d75'; ctx.beginPath(); ctx.arc(p.x, p.y - 9, 13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7bc18a'; ctx.beginPath(); ctx.arc(p.x - 5, p.y - 12, 6, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawPanelTile(cell, ports, x, y, selected, flapAlpha, backFace) {
    ctx.save(); ctx.translate(x, y);
    const angle = Math.atan2(HALF_H, -HALF_W) + Math.PI / 2;
    ctx.rotate(angle); ctx.scale(flapAlpha, 1); ctx.rotate(-angle);
    ctx.shadowColor = COLORS.shadow; ctx.shadowBlur = 12; ctx.shadowOffsetY = 9;
    ctx.beginPath(); ctx.moveTo(0, -HALF_H); ctx.lineTo(HALF_W, 0); ctx.lineTo(0, HALF_H); ctx.lineTo(-HALF_W, 0); ctx.closePath();
    ctx.fillStyle = backFace ? COLORS.panelBack : COLORS.panel; ctx.fill();
    ctx.strokeStyle = selected ? COLORS.accent : '#b48146'; ctx.lineWidth = selected ? 4 : 3; ctx.stroke();
    ctx.restore();
    ctx.save(); ctx.globalAlpha = flapAlpha * .65; ctx.strokeStyle = '#fff1b9'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - 20, y - 5); ctx.lineTo(x + 16, y + 8); ctx.stroke(); ctx.restore();
    for (const port of ports) {
      const edge = portPoint({ x, y }, port);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(edge.x, edge.y); ctx.lineCap = 'round';
      ctx.strokeStyle = '#c98751'; ctx.lineWidth = 12; ctx.stroke();
      ctx.beginPath(); ctx.arc(edge.x, edge.y, 3, 0, Math.PI * 2); ctx.fillStyle = '#fff1cc'; ctx.fill();
    }
  }

  function drawPanels(state, level) {
    for (const panel of level.panels) {
      const tween = state.foldTween?.panelId === panel.id ? state.foldTween : null;
      const folded = state.foldedPanels.has(panel.id);
      const t = tween ? clamp(tween.elapsed / tween.duration, 0, 1) : 0;
      const eased = t * t * (3 - 2 * t);
      const selected = state.selectedPanelId === panel.id;
      const alpha = tween ? Math.max(.08, Math.abs(Math.cos(Math.PI * t))) : 1;
      for (const source of panel.cells) {
        const destination = reflectCell(source, panel);
        const from = tween ? (tween.fromFolded ? destination : source) : (folded ? destination : source);
        const to = tween ? (tween.toFolded ? destination : source) : from;
        const a = centerOf(from); const b = centerOf(to);
        const x = a.x + (b.x - a.x) * eased; const y = a.y + (b.y - a.y) * eased;
        const isFoldedAtEnd = tween ? tween.toFolded : folded;
        const ports = isFoldedAtEnd ? reflectPorts(source.ports ?? ['E', 'W'], panel) : (source.ports ?? ['E', 'W']);
        drawPanelTile(source, ports, x, y, selected, alpha, tween && t > .46 && t < .58);
      }
      const [a, b] = hingePoints(panel); const midX = (a.x + b.x) / 2; const midY = (a.y + b.y) / 2;
      ctx.save(); ctx.setLineDash(selected || tween ? [] : [6, 6]);
      ctx.strokeStyle = selected ? COLORS.accent : '#8d6d45'; ctx.lineWidth = selected ? 5 : 3;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.restore();
      for (const p of [a, b]) {
        ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fillStyle = '#fff5cf'; ctx.fill();
        ctx.strokeStyle = '#916a44'; ctx.lineWidth = 2; ctx.stroke();
      }
      ctx.fillStyle = selected ? COLORS.accent : '#715d42'; ctx.font = '800 10px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(panel.label, midX + 64, midY - 17);
    }
  }

  function drawDrop(cell, number, active, completed = false) {
    const p = centerOf(cell); const color = completed ? '#9bb9a5' : active ? COLORS.good : '#94aeb4';
    ctx.save(); ctx.translate(p.x, p.y - 10); ctx.strokeStyle = color; ctx.lineWidth = active ? 7 : 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-17, 9); ctx.lineTo(-17, -15); ctx.quadraticCurveTo(0, -34, 17, -15); ctx.lineTo(17, 9); ctx.stroke();
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, -18, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff4cf'; ctx.font = '800 10px system-ui'; ctx.textAlign = 'center'; ctx.fillText(String(number), 0, 4);
    ctx.restore();
  }

  function drawParcel(cell, number, active) {
    const p = centerOf(cell); const color = active ? '#ed9e52' : '#c7b78f';
    ctx.save(); ctx.translate(p.x + 18, p.y + 2); ctx.globalAlpha = active ? 1 : .62;
    ctx.fillStyle = '#bf7149'; ctx.beginPath(); ctx.moveTo(-10, -7); ctx.lineTo(0, -13); ctx.lineTo(11, -7); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(-10, -7); ctx.lineTo(0, 0); ctx.lineTo(0, 12); ctx.lineTo(-10, 5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f3c97d'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(11, -7); ctx.lineTo(11, 5); ctx.lineTo(0, 12); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff5dc'; ctx.font = '800 8px system-ui'; ctx.textAlign = 'center'; ctx.fillText(String(number), 0, 7);
    ctx.restore();
  }

  function drawCourier(state) {
    const move = state.moveTween; let cell = state.courier;
    if (move) {
      const t = clamp(move.elapsed / move.duration, 0, 1); const e = t * t * (3 - 2 * t);
      cell = { c: move.from.c + (move.to.c - move.from.c) * e, r: move.from.r + (move.to.r - move.from.r) * e };
    }
    const p = centerOf(cell); const bob = move ? Math.sin(move.elapsed * 16) * 2 : 0;
    ctx.save(); ctx.fillStyle = 'rgba(43,63,51,.2)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 12, 19, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.translate(p.x, p.y - 5 + bob);
    roundRect(ctx, -17, -8, 13, 18, 4, state.carrying ? '#ed7954' : '#4d86a7', '#fff7df');
    ctx.fillStyle = '#ed7954'; ctx.beginPath(); ctx.ellipse(0, 3, 12, 15, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f5c89a'; ctx.beginPath(); ctx.arc(0, -12, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4b776e'; ctx.beginPath(); ctx.moveTo(-9, -15); ctx.lineTo(0, -24); ctx.lineTo(10, -15); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#28453f'; ctx.beginPath(); ctx.arc(3, -12, 1.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f8d478'; ctx.beginPath(); ctx.arc(-6, 18, 4, 0, Math.PI * 2); ctx.arc(7, 18, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawWorldObjects(state, level) {
    const current = level.tasks[state.taskIndex];
    for (let index = 0; index < level.tasks.length; index += 1) {
      const task = level.tasks[index];
      if (index >= state.delivered) drawDrop(task.destination, index + 1, index === state.taskIndex, index < state.delivered);
      if (index > state.taskIndex && index >= state.delivered) drawParcel(task.parcel, index + 1, false);
    }
    if (current && !state.carrying) drawParcel(current.parcel, state.taskIndex + 1, true);
    drawCourier(state);
  }

  function drawBoard(state, level, time) {
    drawBackdrop(time); drawTileGrid(level, state); drawDecor(level);
    for (const road of level.roads) drawRoad(road, road.ports);
    drawPanels(state, level); drawWorldObjects(state, level);
  }

  function text(value, x, y, size, color, weight = 500, align = 'left') {
    ctx.font = `${weight} ${size}px system-ui, sans-serif`; ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(value, x, y);
  }

  function wrapText(value, x, y, maxWidth, lineHeight, color, size = 13, weight = 550) {
    ctx.font = `${weight} ${size}px system-ui, sans-serif`; ctx.fillStyle = color; ctx.textAlign = 'left';
    const words = value.split(' '); let line = ''; let lineY = y;
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > maxWidth && line) { ctx.fillText(line, x, lineY); line = word; lineY += lineHeight; }
      else line = next;
    }
    if (line) ctx.fillText(line, x, lineY);
    return lineY;
  }

  function drawHud(state, level) {
    const foldedCount = state.foldedPanels.size;
    const task = level.tasks[state.taskIndex];
    const deliveriesDone = state.delivered >= level.tasks.length;
    roundRect(ctx, 48, 38, 1184, 82, 22, 'rgba(255,253,244,.94)', 'rgba(82,123,103,.18)');
    text('FOLDLINE', 76, 73, 25, COLORS.ink, 850);
    text(`${String(state.levelIndex + 1).padStart(2, '0')} / 04   ·   ${level.title}`, 78, 97, 12, '#6f8e7e', 750);
    const chips = [
      { x: 730, w: 112, label: `TIME  ${Math.ceil(Math.max(0, level.timeLimit - state.elapsed))}`, fill: '#ecf5e8', ink: '#416b5b' },
      { x: 852, w: 112, label: `FOLDS  ${state.folds}`, fill: '#fbefd0', ink: '#866234' },
      { x: 974, w: 112, label: `MOVES  ${state.moves}`, fill: '#f9e6dd', ink: '#995b4c' },
      { x: 1096, w: 108, label: `SCORE  ${state.totalScore}`, fill: '#e8eff1', ink: '#587985' },
    ];
    for (const chip of chips) { roundRect(ctx, chip.x, 52, chip.w, 48, 14, chip.fill); text(chip.label, chip.x + chip.w / 2, 82, 12, chip.ink, 800, 'center'); }

    roundRect(ctx, 900, 174, 330, 350, 23, 'rgba(255,253,244,.95)', 'rgba(82,123,103,.18)');
    text('TODAY’S ROUTE', 928, 211, 13, '#81978b', 800);
    text(level.subtitle, 928, 241, 21, COLORS.ink, 800);
    wrapText(level.tutorial, 928, 269, 274, 18, '#607c70', 13, 550);
    const taskY = 344;
    ctx.fillStyle = deliveriesDone ? COLORS.good : state.carrying ? '#ed7954' : '#e5a653'; ctx.beginPath(); ctx.arc(937, taskY, 6, 0, Math.PI * 2); ctx.fill();
    const parcelStatus = deliveriesDone ? `ALL ${level.tasks.length} PARCELS DELIVERED` : state.carrying ? `PARCEL ${state.taskIndex + 1}/${level.tasks.length}  ·  ABOARD` : `PARCEL ${state.taskIndex + 1}/${level.tasks.length}  ·  PICK UP`;
    text(parcelStatus, 954, taskY + 5, 12, '#42685a', 750);
    ctx.fillStyle = COLORS.good; ctx.beginPath(); ctx.arc(937, taskY + 31, 6, 0, Math.PI * 2); ctx.fill();
    text(deliveriesDone ? `LEVEL COMPLETE  ·  ${state.delivered}/${level.tasks.length}` : `DROP ${state.taskIndex + 1}  ·  ${state.delivered}/${level.tasks.length} DONE`, 954, taskY + 36, 12, '#42685a', 750);
    roundRect(ctx, 925, 418, 282, 84, 15, '#f1f6e8');
    wrapText(level.routeHint, 944, 442, 245, 16, '#47735f', 12, 700);
    text(foldedCount ? 'Folded panels stay road-active.' : 'Receiving spots are outlined on the map.', 944, 485, 10, '#718a7c', 550);

    roundRect(ctx, 900, 548, 330, 166, 22, 'rgba(255,253,244,.95)', 'rgba(82,123,103,.18)');
    text('CONTROLS', 928, 579, 12, '#81978b', 800);
    text('WASD / arrows', 928, 608, 13, COLORS.ink, 750); text('Walk connected roads', 1073, 608, 11, '#718a7c', 550);
    text('Click a crease twice', 928, 636, 13, COLORS.ink, 750); text('Fold / unfold', 1073, 636, 11, '#718a7c', 550);
    text('P / Esc pause   ·   R restart', 928, 662, 11, '#718a7c', 650);
    text('Score = 350 base + 8 per second left.', 928, 683, 9, '#718a7c', 550);
    text('+15 per move under par + 160 − 40 per fold.', 928, 699, 9, '#718a7c', 550);

    roundRect(ctx, 48, 713, 1184, 48, 16, 'rgba(255,253,244,.94)');
    const feedback = state.messageTime > 0 || state.screen !== 'play' ? state.message : level.routeHint;
    const isError = /No joined|would |blocks|overlap|does not|still does not|carry the courier/i.test(feedback);
    text(feedback, 70, 743, 13, isError ? COLORS.bad : '#42685a', 650);
    text(task ? `DELIVERIES  ${state.delivered}/${level.tasks.length}` : 'CITY COMPLETE', 1208, 743, 11, '#81978b', 700, 'right');
  }

  function drawOverlay(state, level) {
    if (state.screen === 'play') return;
    ctx.fillStyle = 'rgba(32,62,53,.18)'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    const box = state.screen === 'title' ? { x: 280, y: 260, w: 720, h: 310 } : { x: 260, y: 160, w: 760, h: 480 };
    ctx.save(); ctx.shadowColor = 'rgba(30,56,47,.25)'; ctx.shadowBlur = 26; ctx.shadowOffsetY = 12;
    roundRect(ctx, box.x, box.y, box.w, box.h, 28, '#fffaf0'); ctx.restore();
    if (state.screen === 'title') {
      text('A CITY, CREASED.', 640, 327, 13, '#7d988a', 850, 'center');
      text('FOLDLINE', 640, 382, 43, COLORS.ink, 900, 'center');
      text('Four paper puzzles. One tiny courier.', 640, 421, 18, '#668178', 550, 'center');
      text('Fold the right streets, collect every parcel, make each delivery.', 640, 451, 14, '#668178', 550, 'center');
      roundRect(ctx, 474, 484, 332, 54, 18, '#3f9a74');
      text('CLICK OR PRESS SPACE TO START', 640, 518, 14, '#fffdf4', 800, 'center');
    } else if (state.screen === 'paused') {
      text('PAUSED', 640, 350, 33, COLORS.ink, 850, 'center');
      text('Press P or Escape to return to the city.', 640, 397, 16, '#668178', 550, 'center');
      roundRect(ctx, 484, 445, 312, 50, 16, '#f1f6e8'); text('R RESTARTS THIS LEVEL', 640, 477, 13, '#42685a', 800, 'center');
    } else if (state.screen === 'result') {
      text('DELIVERY LOG', 640, 217, 13, '#7d988a', 850, 'center');
      text(`${String(state.levelIndex + 1).padStart(2, '0')}  ·  ${level.title}`, 640, 266, 30, COLORS.ink, 850, 'center');
      text('CITY SEGMENT COMPLETE', 640, 296, 12, COLORS.good, 800, 'center');
      roundRect(ctx, 342, 325, 596, 133, 18, '#f2f6e9');
      text(`MOVES   ${state.moves} / ${level.parMoves} par`, 390, 360, 15, COLORS.ink, 750);
      text(`FOLDS   ${state.folds}     ·     TIME LEFT   ${Math.ceil(Math.max(0, level.timeLimit - state.elapsed))}s`, 390, 390, 15, COLORS.ink, 750);
      text(`LEVEL SCORE   ${state.levelScore}`, 390, 428, 22, COLORS.good, 850);
      text(`Time +${state.scoreBreakdown.time}   ·   Route +${state.scoreBreakdown.route}   ·   Fold +${state.scoreBreakdown.fold}`, 640, 480, 14, '#668178', 650, 'center');
      roundRect(ctx, 478, 505, 324, 58, 18, '#3f9a74');
      text(state.levelIndex === LEVELS.length - 2 ? 'FINAL LEVEL  →' : 'NEXT LEVEL  →', 640, 541, 15, '#fffdf4', 850, 'center');
      text(`RUN TOTAL   ${state.totalScore}`, 640, 593, 13, '#668178', 700, 'center');
      text('Click NEXT LEVEL or press Space / Enter.  R replays this level.', 640, 618, 11, '#81978b', 550, 'center');
    } else if (state.screen === 'complete') {
      text('THE CITY IS CONNECTED', 640, 232, 14, '#7d988a', 850, 'center');
      text('FOUR DELIVERIES, HOME.', 640, 291, 31, COLORS.good, 900, 'center');
      text('All four folds solved. Every parcel made it home.', 640, 330, 16, '#668178', 550, 'center');
      roundRect(ctx, 420, 362, 440, 76, 20, '#f1f6e8');
      text(`TOTAL SCORE   ${state.totalScore}`, 640, 411, 25, COLORS.ink, 850, 'center');
      roundRect(ctx, 478, 505, 324, 58, 18, '#3f9a74'); text('PLAY THE CITY AGAIN', 640, 541, 15, '#fffdf4', 850, 'center');
      text('Your four level scores are saved for this run.', 640, 599, 12, '#81978b', 550, 'center');
    } else if (state.screen === 'lost') {
      text('TIME TO REFOLD', 640, 330, 32, '#c74d48', 850, 'center');
      text(`${level.title} is ready for another try.`, 640, 379, 17, '#668178', 550, 'center');
      roundRect(ctx, 478, 430, 324, 58, 18, '#f1f6e8'); text('PRESS R TO RESTART LEVEL', 640, 466, 14, '#42685a', 800, 'center');
    }
  }

  function draw(state, now) {
    resize();
    const level = LEVELS[state.levelIndex];
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#d8f1e8'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    drawBoard(state, level, now / 1000); drawHud(state, level); drawOverlay(state, level);
  }

  window.addEventListener('resize', resize); resize();
  return { draw, seamHit, buttonHit };
}
