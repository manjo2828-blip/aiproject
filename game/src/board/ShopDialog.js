import { W, H } from '../config/constants.js';
import { Button, txt } from '../ui/Button.js';
import { wait } from './Fx.js';

// 용품점 모달 (플레이어). 구매하면 true, 패스하면 false 로 resolve.
export function askShop(scene, { price, canBuy, score, owned, auto = false }) {
  return new Promise((resolve) => {
    const objs = [], D = 600;
    const add = (o) => { objs.push(o); return o; };
    add(scene.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.6).setDepth(D).setInteractive());
    const g = add(scene.add.graphics().setDepth(D + 1));
    g.fillStyle(0x000000, 0.35).fillRoundedRect(W / 2 - 290 + 4, H / 2 - 190 + 8, 580, 380, 28);
    g.fillStyle(0x5e2a84, 1).fillRoundedRect(W / 2 - 290, H / 2 - 190, 580, 380, 28).lineStyle(6, 0xffffff, 1).strokeRoundedRect(W / 2 - 290, H / 2 - 190, 580, 380, 28);
    g.fillStyle(0x8e44ad, 1).fillRoundedRect(W / 2 - 290, H / 2 - 190, 580, 70, { tl: 28, tr: 28, bl: 0, br: 0 });
    add(txt(scene, W / 2, H / 2 - 155, '용품점', 40, '#ffffff').setDepth(D + 2));
    add(scene.add.image(W / 2 - 190, H / 2 - 50, 'icon_pouch').setDisplaySize(90, 90).setDepth(D + 2));
    add(txt(scene, W / 2 - 100, H / 2 - 80, '스피드 축구화', 36, '#ffd700').setOrigin(0, 0.5).setDepth(D + 2));
    add(txt(scene, W / 2 - 100, H / 2 - 36, '다음 턴 주사위가 1~6!', 26, '#ffffff').setOrigin(0, 0.5).setDepth(D + 2));
    add(txt(scene, W / 2 - 100, H / 2 + 2, '(굴린 뒤 한 번만 사용)', 20, '#e1bee7').setOrigin(0, 0.5).setDepth(D + 2));
    const info = owned ? '이미 스피드 축구화를 가지고 있어요' : canBuy ? `가격 ${price}점  (현재 ${score}점)` : `점수가 부족해요 (필요 ${price}점 / 현재 ${score}점)`;
    add(txt(scene, W / 2, H / 2 + 50, info, 24, canBuy ? '#ffe082' : '#ff9e9e').setDepth(D + 2));
    const close = (v) => { objs.forEach((o) => o.destroy()); resolve(v); };
    const buy = add(new Button(scene, W / 2 - 130, H / 2 + 125, `구매 ${price}점`, { w: 220, h: 72, color: 0x2e9e4a, fontSize: 32, onClick: () => { buy.setEnabled(false); close(true); } }).setDepth(D + 2));
    add(new Button(scene, W / 2 + 130, H / 2 + 125, '패스', { w: 220, h: 72, color: 0x6d6d78, fontSize: 32, onClick: () => close(false) }).setDepth(D + 2));
    if (!canBuy) buy.setEnabled(false);
    if (auto) wait(scene, 900).then(() => close(canBuy));
  });
}
