import { TRACK } from '../config/board.js';
// 보드 기하 정보: 3x3 격자의 테두리 8칸 = 링 트랙. 0 = 좌하단(출발), 시계방향 증가.
export const TW = 280, TH = 115, GAP = 14, CX = 640, CY = 318;
const CELL = [[0, 2], [0, 1], [0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [1, 2]];
export const tileCenter = (i) => ({ x: CX + (CELL[i % TRACK.length][0] - 1) * (TW + GAP), y: CY + (CELL[i % TRACK.length][1] - 1) * (TH + GAP) });
export const TOKEN_X = 92, TOKEN_Y = 8, SHARE_DX = 25;   // 토큰이 서는 자리(칸 오른쪽), 같은 칸 공유 시 좌우 간격
export const PITCH = { x: 30, y: 102, w: 1220, h: 432 };
export const panelTop = 545;
