export type AvatarShape = 'circle' | 'square';

export function detectAvatarShape(avatar: Element): AvatarShape {
  const squareMarker = avatar.querySelector(
    '[style*="shape-square"], [aria-label*="square" i], [aria-label*="carrée" i]',
  );
  return squareMarker ? 'square' : 'circle';
}
