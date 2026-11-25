// Smoke test against a running server (npm start). Verifies tools work and
// that tenants are isolated from each other.
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
  return { isError: !!r.isError, body: r.isError ? r.content[0].text : JSON.parse(r.content[0].text) };
};

const santi = await connect(`${BASE}/mcp/santi`);
const russ = await connect(`${BASE}/mcp`, { 'X-Tenant-Id': '2' });

const tools = (await santi.listTools()).tools.map((t) => t.name);
console.log('tools:', tools.join(', '));

const sInfo = (await call(santi, 'get_tenant_info')).body;
const rInfo = (await call(russ, 'get_tenant_info')).body;
assert.equal(sInfo.Id, 1); assert.equal(rInfo.Id, 2);
console.log('santi:', sInfo.ProductCount, 'products |', 'russ:', rInfo.ProductCount, 'products');

const search = (await call(santi, 'search_products', { query: 'Volvo', limit: 3 })).body;
assert.ok(search.total > 0);
console.log(`santi search "Volvo": ${search.total} hits, first = ${search.items[0].Name}`);

// Isolation: russ cannot see santi's product 1 or order 1, and vice versa.
assert.ok((await call(russ, 'get_product', { productId: 1 })).isError, 'russ must not see product 1');
assert.ok((await call(russ, 'get_order', { orderId: 1 })).isError, 'russ must not see order 1');
assert.ok((await call(santi, 'get_product', { productId: 5001 })).isError, 'santi must not see product 5001');
assert.equal((await call(russ, 'search_products', { query: 'Volvo' })).body.total, 0);
console.log('isolation: OK');

const order = (await call(russ, 'get_order', { orderId: 3 })).body;
assert.equal(order.Lines.length, 2);
const shipped = (await call(santi, 'list_orders', { status: 'Shipped' })).body;
assert.ok(shipped.every((o) => o.StatusName === 'Shipped'));
console.log('russ sales summary:', JSON.stringify((await call(russ, 'sales_summary')).body.byCatalog));

// Unknown tenant is rejected at the HTTP layer.
await assert.rejects(connect(`${BASE}/mcp/nobody`));
console.log('unknown tenant rejected: OK');

await santi.close(); await russ.close();
console.log('\nAll smoke tests passed.');
