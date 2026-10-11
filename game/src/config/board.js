// 8칸 순환 트랙. 인덱스 0 = 출발선(응원석). 한 바퀴 = 8칸.
// 응원석 3 / 옐로카드 2 / VAR 이벤트 2 / 용품점 1
export const TILE_TYPES = {
  cheer:  { label: '응원석',   color: 0x2f80ed, desc: '득점! +3점' },
  yellow: { label: '옐로카드', color: 0xe53935, desc: '반칙! -2점' },
  event:  { label: 'VAR 찬스', color: 0xffa726, desc: '랜덤 이벤트' },
  shop:   { label: '용품점',   color: 0x8e44ad, desc: '스피드 축구화 구매' },
};
export const TRACK = ['cheer', 'yellow', 'event', 'cheer', 'shop', 'yellow', 'event', 'cheer'];
export const TRACK_LEN = TRACK.length;
// 이벤트 종류: 긍정(good) / 부정(bad)
export const EVENTS = {
  swap:   { id: 'swap',   label: '위치 바꾸기',    good: true,  desc: '상대와 위치를 맞바꾼다' },
  extra:  { id: 'extra',  label: '주사위 한 번 더', good: true,  desc: '주사위를 다시 굴린다' },
  tackle: { id: 'tackle', label: '강제 태클',      good: false, desc: '상대에게 강제 태클을 당한다' },
};
