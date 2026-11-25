# MCPDemo2 — Multi-tenant eCommerce MCP servers

A series of MCP (Model Context Protocol) servers that expose the **eCommerce Core** SQLite database to
Claude Desktop. Each one runs locally over **Streamable HTTP**, exposes the same tools, and is
implemented in a different stack, so you can compare them side by side.

| Version | Stack            | Port   | Folder    | Status  |
|---------|------------------|--------|-----------|---------|
| 1       | Node.js (JS, ESM) | `6500` | `node/`   | ✅ built |
| 2       | .NET / C#        | `6501` | `dotnet/` | planned |
| …       | (future)         | `6502–6505` | | |

## Direction

- **One database, many tenants.** The tenant is the **Seller**. Each seller owns Catalogs, which own
  Products. Orders carry `SellerId` directly. Every query filters on the seller, so a tenant can only see
  its own data.
- **Tenant comes from the connection, never from the model.** The tenant is picked by the URL
  (`/mcp/<sellerId|username>`) or an `X-Tenant-Id` header. Tools have **no** tenant parameter, so a prompt
  can't ask for another tenant's data. Asking for another tenant's product or order id returns "not found".
- **Read-only.** The database is opened read-only, and every tool is marked `readOnlyHint`.
- **Stateless HTTP.** Each POST builds a new server bound to the tenant. There are no sessions.
- **Same contract in every version.** Tool names, inputs, and output shapes should match across stacks.

### Tenants in the demo database

| Id | Username | Name                | Data |
|----|----------|---------------------|------|
| 1  | `santi`  | Santi's Cars LLC    | 2 catalogs, 2,100 used cars, 2 orders |
| 2  | `russ`   | Movie Shack of Russ | 2 catalogs (physical + downloadable), 10 movies, 2 orders |
| 3  | `kyle`   | Kyle's Food         | 1 catalog, 8 food products, 2 orders (1 failed) |

`db/db.sqlite` is a copy of `eCommerce-Core/TempFiles/Database/db.sqlite`. The original only had data for
seller 1, so `db/seed-tenants.sql` (idempotent) adds data for sellers 2 and 3. It has already been applied.

### Tools

| Tool              | Purpose |
|-------------------|---------|
| `get_tenant_info` | Who am I? The seller's name plus counts of catalogs, products, and orders |
| `list_catalogs`   | The tenant's catalogs with product counts |
| `search_products` | Text, catalog, supplier, price range, and availability filters, with paging |
| `get_product`     | Full detail for one product |
| `list_orders`     | Newest first, with optional `status` (`Created`, `Authorized`, `Captured`, `Shipped`, `Completed`, `Failed`) and `catalogId` filters |
| `get_order`       | One order with its lines |
| `sales_summary`   | Revenue by catalog and by status, plus the top 5 products (Failed orders excluded) |

## Running the Node version

Requires Node 22.13+. It uses the built-in `node:sqlite`, so there are no native modules to build.

```bash
cd node
npm install
npm start          # http://localhost:6500 (override with PORT=...)
npm test           # in another terminal: smoke test + tenant-isolation checks
```

`GET http://localhost:6500/` lists the tenants and their MCP URLs.

## Connecting Claude Desktop

Claude Desktop launches local servers over stdio, so use [`mcp-remote`](https://www.npmjs.com/package/mcp-remote)
to bridge to the local HTTP server. Add one entry per tenant to
`~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ecommerce-santi": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://localhost:6500/mcp/santi", "--allow-http"]
    },
    "ecommerce-russ": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://localhost:6500/mcp", "--allow-http",
               "--header", "X-Tenant-Id:2"]
    }
  }
}
```

Start the server first, then restart Claude Desktop. Some prompts to try:

- "Which store am I connected to, and what's in it?"
- "Find Volvos under $3,000." (santi)
- "Show me the shipped orders and their tracking numbers."
- "Give me a sales summary by catalog."
- "Show me order 1." (try it as `russ`: order 1 belongs to santi, so it returns not found)

## Layout

```
db/        db.sqlite (copied + seeded), seed-tenants.sql
node/      v1 – Node.js MCP server (port 6500)
  src/server.js   HTTP + tenant resolution + tool registration
  src/db.js       tenant-scoped queries
  test/smoke.js   end-to-end + isolation test
```
