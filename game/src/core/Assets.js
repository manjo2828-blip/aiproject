// 공용 에셋 목록 (BootScene 이 한 번에 로드). 모든 에셋은 Kenney(CC0) — assets/CREDITS.md 참고.
// 씬에서 추가로 필요하면 자기 preload() 에서 this.textures.exists(key) 확인 후 load.
const K = 'assets/kenney/';

export function preloadShared(scene) {
  const L = scene.load;
  // 스포츠팩 아틀라스: 탑다운 선수(characterBlue (n).png 등), 공/장비
  L.atlasXML('sports_chars', K + 'sports/Spritesheet/sheet_characters.png', K + 'sports/Spritesheet/sheet_characters.xml');
  L.atlasXML('sports_equip', K + 'sports/Spritesheet/sheet_equipment.png', K + 'sports/Spritesheet/sheet_equipment.xml');
  L.atlasXML('sports_charequip', K + 'sports/Spritesheet/sheet_charactersEquipment.png', K + 'sports/Spritesheet/sheet_charactersEquipment.xml');
  // 잔디 타일
  L.image('grass', K + 'sports/Tilesheet/groundGrass.png');
  L.image('grass_mown', K + 'sports/Tilesheet/groundGrass_mown.png');
  L.image('grass_mownWide', K + 'sports/Tilesheet/groundGrass_mownWide.png');
  // 보드게임 아이콘 (키: icon_<이름>). 전체 255종은 assets/kenney/icons/default/ 참고
  ['dice_1', 'dice_2', 'dice_3', 'dice_4', 'dice_5', 'dice_6', 'dice_empty', 'dice_question', 'crown_a', 'crown_b', 'flag_square', 'flag_triangle']
    .forEach((n) => L.image('icon_' + n, K + 'icons/default/' + n + '.png'));
  // 이모트 (키: emote_<이름>)
  ['exclamation', 'exclamations', 'stars', 'star', 'faceHappy', 'faceSad', 'faceAngry', 'cash', 'heart', 'heartBroken', 'idea', 'laugh', 'music', 'question', 'swirl', 'alert', 'anger', 'drops']
    .forEach((n) => L.image('emote_' + n, K + 'emotes/Vector/Style 1/emote_' + n + '.png'));
  L.image('ui_star', K + 'ui/Yellow/Default/star.png');
}
