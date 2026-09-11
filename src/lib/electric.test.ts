import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homeOrder } from './electric.ts';

const appliance = (id: string, pinnedToHome = false) => ({ id, pinnedToHome });
const ids = (list: { id: string }[]) => list.map(a => a.id);

test('pinned appliances come first, each group keeping the order it was added in', () => {
  const list = [appliance('fan'), appliance('aircon', true), appliance('rice'), appliance('ref', true)];
  assert.deepEqual(ids(homeOrder(list)), ['aircon', 'ref', 'fan', 'rice']);
});

test('with nothing pinned, every appliance shows in its usual order', () => {
  const list = [appliance('fan'), appliance('rice')];
  assert.deepEqual(ids(homeOrder(list)), ['fan', 'rice']);
});

test('the settings list is left as it was', () => {
  const list = [appliance('fan'), appliance('aircon', true)];
  homeOrder(list);
  assert.deepEqual(ids(list), ['fan', 'aircon']);
});
