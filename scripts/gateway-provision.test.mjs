import test from 'node:test';
import assert from 'node:assert/strict';
import { developmentAccess } from './gateway-provision.mjs';

test('development authorization exports only app access, never provider credentials', () => {
  const result = developmentAccess({ DEPLYZEVIEW_GATEWAY_URL:'https://gateway.example', DEPLYZEVIEW_APP_TOKEN:'app-access', OANDA_API_TOKEN:'provider-secret', NARWHAL_API_KEY:'other-secret' });
  assert.deepEqual(result, { url:'https://gateway.example', appToken:'app-access' });
  assert.equal(developmentAccess({DEPLYZEVIEW_GATEWAY_URL:'https://gateway.example'}), undefined);
});
