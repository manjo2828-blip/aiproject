// PK 공용 상수/지오메트리
export const GL = 360, GR = 920, GT = 190, GB = 390;       // 골대 좌/우/상/하
export const SPOT = { x: 640, y: 545 };                      // 페널티 스폰
export const DIRS = [-1, 0, 1];
export const TARGET = {                                       // 방향별 골대 안 조준점
  '-1': { x: 455, y: 300 }, '0': { x: 640, y: 325 }, '1': { x: 825, y: 300 },
};
export const DIR_NAME = { '-1': '왼쪽', '0': '가운데', '1': '오른쪽' };
export const GAUGE = { x: 700, y: 648, w: 480, h: 26, sweepMs: 1100 };
export const DEFEND_MS = 2500;
export const hex = (n) => '#' + n.toString(16).padStart(6, '0');
