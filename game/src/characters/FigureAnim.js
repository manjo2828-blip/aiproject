// 피규어 애니메이션 (트윈). fig.parts = { rig, body, head, legL, legR, armL:{up,fo}, armR:{up,fo}, trophy }
// 팔 각도 a: 0=아래로 내림, +바깥으로 들어올림(π=머리 위). 왼팔 rot=+a, 오른팔 rot=-a.
const BODY_Y = -62, HEAD_Y = -80;

const tw = (fig, targets, props, dur, o = {}) => {
  const t = fig.scene.tweens.add({ targets, ...props, duration: dur, ease: 'Sine.easeInOut', yoyo: true, repeat: -1, ...o });
  fig._tw.push(t); return t;
};
const arm = (p, side, a, bend = 0, stretch = 1) => {
  const m = side === 'L' ? 1 : -1, A = side === 'L' ? p.armL : p.armR;
  A.up.rotation = m * a; A.fo.rotation = m * bend; A.up.scaleY = stretch; A.fo.scaleY = stretch > 1 ? 0.9 : 1;
};
const armTw = (fig, side, a0, a1, dur, o = {}, bend = 0.2) => {
  const m = side === 'L' ? 1 : -1, A = side === 'L' ? fig.parts.armL : fig.parts.armR;
  A.up.rotation = m * a0; A.fo.rotation = m * bend;
  return tw(fig, A.up, { rotation: m * a1 }, dur, o);
};

// 팔 레이어: back(머리·몸 뒤) | mid(머리 뒤) | front(머리 앞)
const layer = (fig, mode) => {
  const { body, armL, armR, trophy } = fig.parts;
  if (mode === 'back') { body.sendToBack(armR.up); body.sendToBack(armL.up); }
  else if (mode === 'front') { body.bringToTop(armL.up); body.bringToTop(armR.up); body.bringToTop(trophy); }
  else { body.moveTo(armL.up, 2); body.moveTo(armR.up, 3); }
};

export function resetPose(fig) {
  const p = fig.parts;
  p.rig.setPosition(0, 0).setRotation(0); p.body.setPosition(0, BODY_Y).setRotation(0);
  p.head.setPosition(0, HEAD_Y).setRotation(0); p.legL.setRotation(0); p.legR.setRotation(0);
  arm(p, 'L', 0.14, 0.06); arm(p, 'R', 0.14, 0.06); p.trophy.setVisible(false).setScale(1).setRotation(0);
  fig.setExpression('normal'); layer(fig, 'mid');
}

const ANIMS = {
  idle(fig) {
    const p = fig.parts;
    tw(fig, p.body, { y: BODY_Y - 3 }, 700);
    tw(fig, p.head, { rotation: 0.05 }, 1300); p.head.rotation = -0.05;
    armTw(fig, 'L', 0.12, 0.26, 700); armTw(fig, 'R', 0.26, 0.12, 700);
    fig._ev.push(fig.scene.time.addEvent({ delay: 2600, loop: true, callback: () => { fig.setExpression('blink'); fig.scene.time.delayedCall(130, () => fig.active && fig.setExpression('normal')); } }));
  },
  run(fig) {
    const p = fig.parts; fig.setExpression('happy');
    p.legL.rotation = -0.85; tw(fig, p.legL, { rotation: 0.85 }, 190);
    p.legR.rotation = 0.85; tw(fig, p.legR, { rotation: -0.85 }, 190);
    p.body.rotation = 0.09; tw(fig, p.body, { y: BODY_Y - 7 }, 190);
    armTw(fig, 'L', 0.2, 1.0, 190, {}, 1.5); armTw(fig, 'R', 1.0, 0.2, 190, {}, 1.5);
    p.head.y = HEAD_Y + 1;
  },
  dance(fig) {
    const p = fig.parts; fig.setExpression('happy');
    p.body.x = -8; p.body.rotation = -0.1;
    tw(fig, p.body, { x: 8, rotation: 0.1 }, 290);
    tw(fig, p.body, { y: BODY_Y - 6 }, 145);
    p.legL.rotation = 0.5; tw(fig, p.legL, { rotation: -0.25 }, 290);
    p.legR.rotation = 0.25; tw(fig, p.legR, { rotation: -0.5 }, 290);
    armTw(fig, 'L', 0.6, 2.5, 290, {}, 0.8); armTw(fig, 'R', 2.5, 0.6, 290, {}, 0.8);
    p.head.rotation = 0.12; tw(fig, p.head, { rotation: -0.12 }, 290);
  },
  cheer(fig) {
    const p = fig.parts; fig.setExpression('cheer');
    tw(fig, p.rig, { y: -30 }, 330, { ease: 'Quad.easeOut' });
    p.legL.rotation = 0.2; p.legR.rotation = -0.2; tw(fig, p.legL, { rotation: 0.4 }, 330); tw(fig, p.legR, { rotation: -0.4 }, 330);
    armTw(fig, 'L', 2.2, 2.65, 165, {}, 0); armTw(fig, 'R', 2.65, 2.2, 165, {}, 0);
    tw(fig, p.head, { rotation: 0.08 }, 330); p.head.rotation = -0.08;
  },
  trophy(fig) {
    const p = fig.parts; fig.setExpression('cheer');
    p.trophy.setVisible(true).setPosition(68, -92);
    arm(p, 'R', 2.5, 0.05); armTw(fig, 'L', 2.2, 2.7, 260, {}, 0.3);
    tw(fig, p.body, { rotation: 0.07 }, 800); p.body.rotation = -0.07;
    tw(fig, p.body, { y: BODY_Y - 4 }, 400);
    tw(fig, p.trophy, { scale: 1.06 }, 500);
    p.head.rotation = -0.06; tw(fig, p.head, { rotation: 0.06 }, 800);
    p.legL.rotation = 0.08; p.legR.rotation = -0.08;
  },
  sad(fig) {
    const p = fig.parts; fig.setExpression('sad');
    p.head.y = HEAD_Y + 8; p.head.rotation = 0.14;
    p.body.y = BODY_Y + 4; p.body.rotation = 0.05;
    tw(fig, p.body, { y: BODY_Y + 6 }, 1200);
    arm(p, 'L', 0.04, 0.04); arm(p, 'R', 0.04, 0.04);
    p.legL.rotation = -0.04; p.legR.rotation = 0.04;
    const wipe = () => {
      if (!fig.active) return;
      layer(fig, 'front'); fig.scene.time.delayedCall(1700, () => fig.active && fig.current === 'sad' && layer(fig, 'mid'));
      const A = p.armR, e = { ease: 'Sine.easeInOut', yoyo: true, hold: 900, duration: 350, repeat: 0 };
      fig._tw.push(fig.scene.tweens.add({ targets: A.up, rotation: -3.45, ...e }));
      fig._tw.push(fig.scene.tweens.add({ targets: A.fo, rotation: -2.6, ...e }));
      fig._tw.push(fig.scene.tweens.add({ targets: p.head, x: { from: -1.5, to: 1.5 }, duration: 70, yoyo: true, repeat: 10, delay: 350 }));
    };
    fig._ev.push(fig.scene.time.addEvent({ delay: 3200, loop: true, callback: wipe }));
    fig.scene.time.delayedCall(700, wipe);
  },
  kick(fig) {
    const p = fig.parts; fig.setExpression('happy');
    p.legR.rotation = 0.75; tw(fig, p.legR, { rotation: -1.25 }, 240, { ease: 'Cubic.easeIn', hold: 350, repeatDelay: 450 });
    p.body.rotation = 0.12; tw(fig, p.body, { rotation: -0.1 }, 240, { ease: 'Cubic.easeIn', hold: 350, repeatDelay: 450 });
    armTw(fig, 'L', 1.6, 0.3, 240, { hold: 350, repeatDelay: 450 }, 0.3); armTw(fig, 'R', 0.2, 1.3, 240, { hold: 350, repeatDelay: 450 }, 0.3);
    p.legL.rotation = 0.05;
  },
};

export function playAnim(fig, name) {
  fig.stopAnim();
  (ANIMS[name] || ANIMS.idle)(fig);
  fig.current = name;
}
