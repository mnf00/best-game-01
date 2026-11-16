const spine = [
  { c: 0, r: 1, ports: ['N', 'S'] },
  { c: 0, r: 2, ports: ['N', 'S', 'E'] },
  { c: 0, r: 3, ports: ['N', 'S'] },
];
const bridgePanel = (id, row, label = 'AMBER FLAP') => ({
  id,
  label,
  hinge: { axis: 'vertical', x: 4, from: row, to: row + 1 },
  cells: [{ c: 5, r: row, ports: ['E', 'W'] }, { c: 6, r: row, ports: ['E', 'W'] }],
  receivingCells: [{ c: 1, r: row }, { c: 2, r: row }],
});
const buildings = [
  { c: 1, r: 0 }, { c: 2, r: 0 }, { c: 5, r: 0 },
  { c: 0, r: 4 }, { c: 4, r: 4 }, { c: 6, r: 4 },
];

export const LEVELS = [
  {
    id: 'first-fold', title: 'FIRST FOLD', subtitle: 'The little lane',
    tutorial: 'Pick up the parcel, select the dotted crease, then click it again to fold the amber lane.',
    routeHint: 'The folded road should join the courier’s street to the green drop.',
    start: { c: 0, r: 3 },
    roads: [
      ...spine,
      { c: 3, r: 2, ports: ['W'] },
    ],
    panels: [bridgePanel('market-flap', 2)],
    buildings,
    tasks: [{ parcel: { c: 0, r: 2 }, destination: { c: 3, r: 2 } }],
    timeLimit: 120, parMoves: 4, parFolds: 1, solutionPanels: ['market-flap'],
  },
  {
    id: 'crossroads', title: 'CROSSROADS', subtitle: 'Two creases, one route',
    tutorial: 'Two amber flaps can fold. The upper crease makes a side lane; find the crease aligned with both street ends.',
    routeHint: 'Only one folded lane reaches the green drop. A disconnected fold can be safely undone.',
    start: { c: 0, r: 3 },
    roads: [
      ...spine,
      { c: 3, r: 2, ports: ['W'] },
    ],
    panels: [bridgePanel('north-flap', 1, 'NORTH CREASE'), bridgePanel('crossing-flap', 2, 'CROSSING CREASE')],
    buildings,
    tasks: [{ parcel: { c: 0, r: 2 }, destination: { c: 3, r: 2 } }],
    timeLimit: 150, parMoves: 4, parFolds: 1, solutionPanels: ['crossing-flap'],
  },
  {
    id: 'paper-bridge', title: 'PAPER BRIDGE', subtitle: 'Down, across, up',
    tutorial: 'Collect the parcel at the foot of the lane. Fold the lower flap to bridge the gap, then follow the road north.',
    routeHint: 'The only complete route turns south onto the long fold, then north to the raised drop.',
    start: { c: 0, r: 1 },
    roads: [
      { c: 0, r: 1, ports: ['N', 'S'] },
      { c: 0, r: 2, ports: ['N', 'S'] },
      { c: 0, r: 3, ports: ['N', 'S', 'E'] },
      { c: 3, r: 1, ports: ['S'] },
      { c: 3, r: 2, ports: ['N', 'S'] },
      { c: 3, r: 3, ports: ['N', 'W'] },
    ],
    panels: [bridgePanel('low-bridge', 3, 'LOW BRIDGE CREASE')],
    buildings,
    tasks: [{ parcel: { c: 0, r: 3 }, destination: { c: 3, r: 1 } }],
    timeLimit: 180, parMoves: 7, parFolds: 1, solutionPanels: ['low-bridge'],
  },
  {
    id: 'double-delivery', title: 'DOUBLE DELIVERY', subtitle: 'Out and back',
    tutorial: 'Deliver parcel 1 across the fold. Parcel 2 appears at the far curb; bring it back to the upper green drop.',
    routeHint: 'The folded street stays useful on the return trip. The active parcel and drop are numbered in the HUD.',
    start: { c: 0, r: 3 },
    roads: [
      ...spine,
      { c: 3, r: 2, ports: ['W', 'S'] },
      { c: 3, r: 3, ports: ['N'] },
    ],
    panels: [bridgePanel('delivery-flap', 2)],
    buildings,
    tasks: [
      { parcel: { c: 0, r: 2 }, destination: { c: 3, r: 2 } },
      { parcel: { c: 3, r: 3 }, destination: { c: 0, r: 1 } },
    ],
    timeLimit: 240, parMoves: 10, parFolds: 1, solutionPanels: ['delivery-flap'],
  },
];
