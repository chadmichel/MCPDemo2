// Smoke test against a running server (npm start). Verifies the
// list_tenants -> tenantId flow and that tenants are isolated.
//   MCP_URL=http://localhost:6500 npm test
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const BASE = process.env.MCP_URL ?? 'http://localhost:6500';

async function connect(url, headers) {
  const client = new Client({ name: 'smoke', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } }));
  return client;
}
const call = async (c, name, args = {}) => {
  const r = await c.callTool({ name, arguments: args });
  const text = r.content[0].text;
  return { isError: !!r.isError, text, body: r.isError ? text : JSON.parse(text) };
};

// --- Unbound connection: all tenants, tenantId chosen by the client ---------
const all = await connect(`${BASE}/mcp`);
console.log('tools:', (await all.listTools()).tools.map((t) => t.name).join(', '));

const tenants = (await call(all, 'list_tenants')).body;
assert.equal(tenants.length, 3);
console.log('list_tenants:', tenants.map((t) => `${t.Id}=${t.UserName}`).join(', '));
const [santi, russ] = tenants;

// tenantId is required
assert.ok((await call(all, 'list_orders', {})).isError, 'list_orders without tenantId must fail');
assert.ok((await call(all, 'list_orders', { tenantId: 999 })).isError, 'unknown tenantId must fail');
console.log('tenantId required / validated: OK');

const sOrders = (await call(all, 'list_orders', { tenantId: santi.Id })).body;
const rOrders = (await call(all, 'list_orders', { tenantId: russ.Id })).body;
assert.ok(sOrders.length > 0 && rOrders.length > 0);
assert.ok(!sOrders.some((o) => rOrders.some((r) => r.Id === o.Id)), 'order sets must not overlap');
console.log(`orders: santi=${sOrders.map((o) => o.Id)} russ=${rOrders.map((o) => o.Id)}`);

const search = (await call(all, 'search_products', { tenantId: santi.Id, query: 'Volvo', limit: 3 })).body;
assert.ok(search.total > 0);
assert.equal((await call(all, 'search_products', { tenantId: russ.Id, query: 'Volvo' })).body.total, 0);
assert.ok((await call(all, 'get_order', { tenantId: russ.Id, orderId: 1 })).isError, 'russ must not see order 1');
assert.ok((await call(all, 'get_product', { tenantId: santi.Id, productId: 5001 })).isError, 'santi must not see product 5001');
assert.equal((await call(all, 'get_order', { tenantId: russ.Id, orderId: 3 })).body.Lines.length, 2);
const shipped = (await call(all, 'list_orders', { tenantId: santi.Id, status: 'Shipped' })).body;
assert.ok(shipped.every((o) => o.StatusName === 'Shipped'));
console.log('cross-tenant isolation: OK');

// --- Bound connection: /mcp/russ only exposes russ --------------------------
const bound = await connect(`${BASE}/mcp/russ`);
const boundTenants = (await call(bound, 'list_tenants')).body;
assert.deepEqual(boundTenants.map((t) => t.Id), [russ.Id]);
assert.ok((await call(bound, 'list_orders', { tenantId: santi.Id })).isError, 'bound conn must reject other tenant');
assert.ok(!(await call(bound, 'list_orders', { tenantId: russ.Id })).isError);
const viaHeader = await connect(`${BASE}/mcp`, { 'X-Tenant-Id': 'kyle' });
assert.equal((await call(viaHeader, 'list_tenants')).body.length, 1);
console.log('tenant-bound connections (path + header): OK');

await assert.rejects(connect(`${BASE}/mcp/nobody`));
console.log('unknown tenant URL rejected: OK');

await Promise.all([all.close(), bound.close(), viaHeader.close()]);
console.log('\nAll smoke tests passed.');
