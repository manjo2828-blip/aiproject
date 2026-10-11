// Graphics 는 매 프레임 재삼각화되어 느리다 → 정적 도형은 텍스처로 구워서 Image 로 쓴다.
export function bake(scene, key, w, h, draw) {
  if (!scene.textures.exists(key)) {
    const g = scene.make.graphics({ add: false });
    draw(g); g.generateTexture(key, w, h); g.destroy();
  }
  return key;
}
