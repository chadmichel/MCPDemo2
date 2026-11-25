// Multi-tenant eCommerce MCP server over Streamable HTTP (stateless).
//
// Tenant = Seller. The tenant is resolved per request from either:
//   - the URL path:  POST /mcp/<sellerId|username>     e.g. /mcp/santi
//   - a header:      POST /mcp  with  X-Tenant-Id: <sellerId|username>
// A fresh McpServer is built for each request with the tenant bound in a
// closure, so tools never accept a tenant argument from the model.
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import * as data from './db.js';

const PORT = Number(process.env.PORT ?? 6500);

const json = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });
const notFound = (what) => ({ content: [{ type: 'text', text: `${what} not found for this tenant.` }], isError: true });

function buildServer(tenant) {
  const server = new McpServer(
    { name: 'ecommerce-mcp-node', version: '1.0.0' },
    { instructions: `You are connected to the eCommerce store of tenant "${tenant.Name}" (seller id ${tenant.Id}). All data is scoped to this tenant.` },
  );
  const sellerId = tenant.Id;

  server.registerTool('get_tenant_info', {
    title: 'Get tenant info',
    description: 'Describe the current tenant (seller): name, username and counts of catalogs, products and orders.',
    annotations: { readOnlyHint: true },
  }, async () => json(data.getTenantInfo(sellerId)));

  server.registerTool('list_catalogs', {
    title: 'List catalogs',
    description: "List the current tenant's catalogs with product counts.",
    annotations: { readOnlyHint: true },
  }, async () => json(data.listCatalogs(sellerId)));

  server.registerTool('search_products', {
    title: 'Search products',
    description: "Search the current tenant's products by text, catalog, supplier, price range and availability. Paged.",
    inputSchema: {
      query: z.string().optional().describe('Text matched against name, summary and supplier'),
      catalogId: z.number().int().optional(),
      supplier: z.string().optional(),
      minPrice: z.number().optional(),
      maxPrice: z.number().optional(),
      availableOnly: z.boolean().optional(),
      limit: z.number().int().min(1).max(100).default(25),
      offset: z.number().int().min(0).default(0),
    },
    annotations: { readOnlyHint: true },
  }, async (args) => json(data.searchProducts(sellerId, args)));

  server.registerTool('get_product', {
    title: 'Get product',
    description: 'Get full details for one product owned by the current tenant.',
    inputSchema: { productId: z.number().int() },
    annotations: { readOnlyHint: true },
  }, async ({ productId }) => {
    const p = data.getProduct(sellerId, productId);
    return p ? json(p) : notFound(`Product ${productId}`);
  });

  server.registerTool('list_orders', {
    title: 'List orders',
    description: "List the current tenant's orders, newest first. Optionally filter by status or catalog.",
    inputSchema: {
      status: z.enum(Object.keys(data.STATUS_CODES)).optional().describe('Order status name'),
      catalogId: z.number().int().optional(),
      limit: z.number().int().min(1).max(100).default(25),
    },
    annotations: { readOnlyHint: true },
  }, async ({ status, ...rest }) => json(data.listOrders(sellerId, { ...rest, status: status && data.STATUS_CODES[status] })));

  server.registerTool('get_order', {
    title: 'Get order',
    description: 'Get one order (with its order lines) owned by the current tenant.',
    inputSchema: { orderId: z.number().int() },
    annotations: { readOnlyHint: true },
  }, async ({ orderId }) => {
    const o = data.getOrder(sellerId, orderId);
    return o ? json(o) : notFound(`Order ${orderId}`);
  });

  server.registerTool('sales_summary', {
    title: 'Sales summary',
    description: 'Revenue and order counts for the current tenant by catalog and status, plus top products.',
    annotations: { readOnlyHint: true },
  }, async () => json(data.salesSummary(sellerId)));

  return server;
}

const app = express();
app.use(express.json());

// Dev convenience: see which tenants exist and how to connect.
app.get('/', (_req, res) => {
  res.json({
    server: 'ecommerce-mcp-node',
    endpoints: ['/mcp/<sellerId|username>', '/mcp (with X-Tenant-Id header)'],
    tenants: data.listTenants().map((t) => ({ ...t, url: `http://localhost:${PORT}/mcp/${t.UserName}` })),
  });
});

async function handleMcp(req, res) {
  const key = req.params.tenant ?? req.get('x-tenant-id');
  const tenant = data.findTenant(key);
  if (!tenant) {
    return res.status(key ? 404 : 400).json({
      jsonrpc: '2.0',
      error: { code: -32001, message: key ? `Unknown tenant "${key}"` : 'Tenant required: use /mcp/<tenant> or X-Tenant-Id header' },
      id: null,
    });
  }

  const server = buildServer(tenant);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined }); // stateless
  res.on('close', () => { transport.close(); server.close(); });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null });
  }
}

// Stateless mode: only POST is meaningful; GET/DELETE (SSE stream / session end) are not supported.
const methodNotAllowed = (_req, res) =>
  res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null });

app.post(['/mcp', '/mcp/:tenant'], handleMcp);
app.get(['/mcp', '/mcp/:tenant'], methodNotAllowed);
app.delete(['/mcp', '/mcp/:tenant'], methodNotAllowed);

app.listen(PORT, '127.0.0.1', () => {
  console.log(`ecommerce-mcp-node listening on http://localhost:${PORT}`);
  for (const t of data.listTenants()) console.log(`  tenant ${t.Id} (${t.Name}): http://localhost:${PORT}/mcp/${t.UserName}`);
});
