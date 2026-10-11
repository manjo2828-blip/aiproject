import { RULES } from './constants.js';
// 4종 국대 캐릭터. portrait 그림은 src/characters/CharacterArt.js 가 이 데이터로 그린다.
export const CHARACTERS = {
  felipe: {
    id: 'felipe', name: '펠리페', en: 'Felipe', country: '브라질', flag: '🇧🇷', gender: 'm',
    hair: { color: 0xf4d35e, style: 'short' }, skin: 0xf1c27d,
    kit: { primary: 0xffdf00, secondary: 0x1b4fb3, pattern: 'solid' },
    accent: 0xffd700, accentHex: '#ffd700',
    traitName: '삼바 세레머니', traitDesc: '한 바퀴 완주 보너스 +12점 (+2점 추가)',
    sportsTeam: 'Special',   // Kenney 탑다운 말 스프라이트 (아래 Sprites 참고)
  },
  jun: {
    id: 'jun', name: '준', en: 'Jun', country: '대한민국', flag: '🇰🇷', gender: 'm',
    hair: { color: 0x1a1a1a, style: 'dandy' }, skin: 0xf2c9a0,
    kit: { primary: 0xd32f2f, secondary: 0x111111, pattern: 'solid' },
    accent: 0xff4d4d, accentHex: '#ff4d4d',
    traitName: '수호신 태클', traitDesc: '태클 피격 시 -2점만 차감 (-1점 방어)',
    sportsTeam: 'Red',
  },
  chloe: {
    id: 'chloe', name: '클로에', en: 'Chloe', country: '프랑스', flag: '🇫🇷', gender: 'f',
    hair: { color: 0x1a1a1a, style: 'bob' }, skin: 0xf6d5b8,
    kit: { primary: 0x12307a, secondary: 0xffffff, pattern: 'solid' },
    accent: 0x1e90ff, accentHex: '#1e90ff',
    traitName: '음바페급 치달', traitDesc: '주사위 1이 나올 확률 감소 & 이동 속도 업',
    sportsTeam: 'Blue',
  },
  camila: {
    id: 'camila', name: '카밀라', en: 'Camila', country: '아르헨티나', flag: '🇦🇷', gender: 'f',
    hair: { color: 0xf4d35e, style: 'ponytail' }, skin: 0xe9b98c,
    kit: { primary: 0x87ceeb, secondary: 0xffffff, pattern: 'stripes' },
    accent: 0x87ceeb, accentHex: '#87ceeb',
    traitName: '마법의 패스', traitDesc: '이벤트 칸 도착 시 긍정적 이벤트 확률 증가',
    sportsTeam: 'White',
  },
};
export const CHAR_IDS = Object.keys(CHARACTERS);

// --- 특성 헬퍼 (규칙 계산은 반드시 여기를 거칠 것) ---
export const lapBonus = (id) => RULES.LAP_BONUS + (id === 'felipe' ? 2 : 0);
export const tacklePenalty = (victimId) => RULES.TACKLE - (victimId === 'jun' ? 1 : 0); // 피격자가 잃는 점수
// 주사위(1~3). 클로에는 1의 확률이 낮다(가중치 1:2:2 vs 기본 1:1:1)
export function rollDice(id, max = RULES.DICE_MAX, rng = Math.random) {
  if (max === 3) {
    const w = id === 'chloe' ? [0.5, 1, 1] : [1, 1, 1];
    const sum = w[0] + w[1] + w[2]; let r = rng() * sum;
    for (let i = 0; i < 3; i++) { if ((r -= w[i]) < 0) return i + 1; }
    return 3;
  }
  return 1 + Math.floor(rng() * max);
}
export const moveSpeedMul = (id) => (id === 'chloe' ? 1.5 : 1);   // 이동 연출 속도
// 이벤트 칸: 긍정 이벤트 확률 (카밀라 증가)
export const goodEventChance = (id) => (id === 'camila' ? 0.85 : 2 / 3);   // 기본: 3종 균등(좋은 이벤트 2/3), 카밀라는 85%

// 선택 캐릭터를 제외한 3명 중 AI 1명 랜덤 지정
export function pickAI(playerId, rng = Math.random) {
  const rest = CHAR_IDS.filter((c) => c !== playerId);
  return rest[Math.floor(rng() * rest.length)];
}
