// 전역 상수
export const W = 1280, H = 720;
export const MAX_TURNS = 5;
export const FONT = 'Jua, "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
export const COLORS = {
  field: 0x2e7d32, fieldDark: 0x256628, line: 0xffffff,
  cheer: 0x2f80ed, yellow: 0xe53935, event: 0xffa726, shop: 0x8e44ad,
  ui: 0x14301a, gold: 0xffd700,
};
export const RULES = {
  LAP_BONUS: 10, CHEER: 3, YELLOW: -2, TACKLE: 3, MINIGAME_WIN: 5, MINIGAME_DRAW: 2,
  SHOP_PRICE: 4,            // 스피드 축구화 가격
  DICE_MAX: 3, BOOST_DICE_MAX: 6,
};
export const SIDE = { PLAYER: 'player', AI: 'ai' };
// 씬 키
export const SCENES = {
  BOOT: 'BootScene', TITLE: 'TitleScene', BOARD: 'BoardScene', RESULT: 'ResultScene',
  PK: 'PKScene', HEADING: 'HeadingScene', DRIBBLE: 'DribbleScene',
};
export const MINIGAMES = [SCENES.PK, SCENES.HEADING, SCENES.DRIBBLE];
