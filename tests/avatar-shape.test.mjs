import assert from 'node:assert/strict';
import test from 'node:test';
import { parseHTML } from 'linkedom';
import { detectAvatarShape } from '../src/ui/avatar-shape.ts';

test('detects X square-avatar markers and defaults to a circle', () => {
  const { document } = parseHTML(`
    <div id="circle"><div style="clip-path: url(&quot;#shape-circle&quot;)"></div></div>
    <div id="square"><div style="clip-path: url(&quot;#shape-square-rx-15&quot;)"></div></div>
  `);
  const circle = document.querySelector('#circle');
  const square = document.querySelector('#square');
  assert.ok(circle);
  assert.ok(square);

  assert.equal(detectAvatarShape(circle), 'circle');
  assert.equal(detectAvatarShape(square), 'square');
});
