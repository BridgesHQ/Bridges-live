import {test} from 'node:test';
import assert from 'node:assert/strict';
import {complianceFlags} from '../lib/ai/compliance';

test('ordinary listing words are not flagged', () => {
  for (const t of ['Sunny terrace with bay views', '123 Grace Ave', 'Islamorada waterfront', 'Embrace the open floor plan', 'Brand-new skids-free flooring', 'Fireplace and racecourse view']) {
    assert.deepEqual(complianceFlags(t), [], t);
  }
});
test('protected-class and steering language is flagged', () => {
  assert.deepEqual(complianceFlags('Perfect for a young family with kids'), ['kids', 'perfect for']);
  assert.ok(complianceFlags('Great for families').includes('great for families'));
  assert.ok(complianceFlags('Walk to the Christian school').includes('christian'));
  assert.ok(complianceFlags('wheelchair-accessible ramp').includes('wheelchair'));
  assert.ok(complianceFlags('IDEAL   FOR retirees').includes('ideal for'));
});
