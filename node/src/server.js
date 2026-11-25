// Multi-tenant eCommerce MCP server over Streamable HTTP (stateless).
//
// Tenant = Seller. Clients call `list_tenants` first, then pass `tenantId` to
// every data tool (orders, products, catalogs, sales).
//
// The connection URL decides which tenants a client may use:
//   - POST /mcp                          -> all tenants (admin / demo mode)
//   - POST /mcp/<sellerId|username>      -> only that tenant
//   - POST /mcp + X-Tenant-Id header     -> only that tenant
// On a tenant-bound connection, list_tenants returns just that tenant and any
// other tenantId is rejected.
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import * as data from './db.js';

const PORT = Number(process.env.PORT ?? 6500);

const json = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });
const error = (text) => ({ content: [{ type: 'text', text }], isError: true });
const notFound = (what) => error(`${what} not found for this tenant.`);

const tenantIdArg = z.number().int().describe('Tenant (seller) id from list_tenants');

/** @param boundTenant the tenant this connection is locked to, or undefined for all tenants */
function buildServer(boundTenant) {
  const server = new McpServer(
    { name: 'ecommerce-mcp-node', version: '1.0.0' },
    {
      instructions: 'Multi-tenant eCommerce store. Call list_tenants first, then pass tenantId to every other tool. '
        + 'All data returned is scoped to that tenant.',
    },
  );

  const allowedTenants = () => (boundTenant ? [boundTenant] : data.listTenants());

  // Wrap a handler so it runs only for a valid, permitted tenantId.
  const forTenant = (handler) => async ({ tenantId, ...args }) => {
    if (boundTenant && tenantId !== boundTenant.Id) {
      return error(`Tenant ${tenantId} is not available on this connection. Call list_tenants to see allowed tenants.`);
    }
    if (!data.findTenant(String(tenantId))) return error(`Unknown tenant ${tenantId}. Call list_tenants.`);
    return handler(tenantId, args);
  };

  const ro = { readOnlyHint: true };

  server.registerTool('list_tenants', {
    title: 'List tenants',
    description: 'List the tenants (sellers) available on this connection. Use the returned Id as tenantId for all other tools.',
    annotations: ro,
  }, async () => json(allowedTenants()));

  server.registerTool('get_tenant_info', {
    title: 'Get tenant info',
    description: 'Describe a tenant (seller): name, username and counts of catalogs, products and orders.',
    inputSchema: { tenantId: tenantIdArg },
    annotations: ro,
  }, forTenant(async (sellerId) => json(data.getTenantInfo(sellerId))));

  server.registerTool('list_catalogs', {
    title: 'List catalogs',
    description: "List a tenant's catalogs with product counts.",
    inputSchema: { tenantId: tenantIdArg },
    annotations: ro,
  }, forTenant(async (sellerId) => json(data.listCatalogs(sellerId))));

  server.registerTool('search_products', {
    title: 'Search products',
    description: "Search a tenant's products by text, catalog, supplier, price range and availability. Paged.",
    inputSchema: {
      tenantId: tenantIdArg,
      query: z.string().optional().describe('Text matched against name, summary and supplier'),
      catalogId: z.number().int().optional(),
      supplier: z.string().optional(),
      minPrice: z.number().optional(),
      maxPrice: z.number().optional(),
      availableOnly: z.boolean().optional(),
      limit: z.number().int().min(1).max(100).default(25),
      offset: z.number().int().min(0).default(0),
    },
    annotations: ro,
  }, forTenant(async (sellerId, args) => json(data.searchProducts(sellerId, args))));

  server.registerTool('get_product', {
    title: 'Get product',
    description: 'Get full details for one product owned by the tenant.',
    inputSchema: { tenantId: tenantIdArg, productId: z.number().int() },
    annotations: ro,
  }, forTenant(async (sellerId, { productId }) => {
    const p = data.getProduct(sellerId, productId);
    return p ? json(p) : notFound(`Product ${productId}`);
  }));

  server.registerTool('list_orders', {
    title: 'List orders',
    description: "List a tenant's orders, newest first. Optionally filter by status or catalog.",
    inputSchema: {
      tenantId: tenantIdArg,
      status: z.enum(Object.keys(data.STATUS_CODES)).optional().describe('Order status name'),
      catalogId: z.number().int().optional(),
      limit: z.number().int().min(1).max(100).default(25),
    },
    annotations: ro,
  }, forTenant(async (sellerId, { status, ...rest }) =>
    json(data.listOrders(sellerId, { ...rest, status: status && data.STATUS_CODES[status] }))));

  server.registerTool('get_order', {
    title: 'Get order',
    description: 'Get one order (with its order lines) owned by the tenant.',
    inputSchema: { tenantId: tenantIdArg, orderId: z.number().int() },
    annotations: ro,
  }, forTenant(async (sellerId, { orderId }) => {
    const o = data.getOrder(sellerId, orderId);
    return o ? json(o) : notFound(`Order ${orderId}`);
  }));

  server.registerTool('sales_summary', {
    title: 'Sales summary',
    description: 'Revenue and order counts for a tenant by catalog and status, plus top products.',
    inputSchema: { tenantId: tenantIdArg },
    annotations: ro,
  }, forTenant(async (sellerId) => json(data.salesSummary(sellerId))));

  return server;
}

const app = express();
app.use(express.json());

// Dev convenience: see which tenants exist and how to connect.
app.get('/', (_req, res) => {
  res.json({
    server: 'ecommerce-mcp-node',
    endpoints: { allTenants: `http://localhost:${PORT}/mcp`, singleTenant: '/mcp/<sellerId|username> or X-Tenant-Id header' },
    tenants: data.listTenants().map((t) => ({ ...t, url: `http://localhost:${PORT}/mcp/${t.UserName}` })),
  });
});

async function handleMcp(req, res) {
  const key = req.params.tenant ?? req.get('x-tenant-id');
  const tenant = key ? data.findTenant(key) : undefined;
  if (key && !tenant) {
    return res.status(404).json({ jsonrpc: '2.0', error: { code: -32001, message: `Unknown tenant "${key}"` }, id: null });
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
  console.log(`  all tenants: http://localhost:${PORT}/mcp`);
  for (const t of data.listTenants()) console.log(`  tenant ${t.Id} (${t.Name}): http://localhost:${PORT}/mcp/${t.UserName}`);
});
