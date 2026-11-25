// Data access. Every query that touches tenant data takes a sellerId and
// filters on it, so one tenant can never read another tenant's rows.
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const defaultPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../db/db.sqlite');
const db = new DatabaseSync(process.env.DB_PATH ?? defaultPath, { readOnly: true });

export const ORDER_STATUSES = { 0: 'Created', 10: 'Authorized', 15: 'Captured', 20: 'Shipped', 30: 'Completed', 100: 'Failed' };
export const STATUS_CODES = Object.fromEntries(Object.entries(ORDER_STATUSES).map(([k, v]) => [v, Number(k)]));

const withStatus = (o) => o && { ...o, StatusName: ORDER_STATUSES[o.Status] ?? 'Unknown' };

/** Resolve a tenant from a numeric seller id or a seller username. */
export function findTenant(key) {
  if (key == null || key === '') return undefined;
  const sql = /^\d+$/.test(key)
    ? 'SELECT Id, Name, UserName FROM Sellers WHERE Id = ?'
    : 'SELECT Id, Name, UserName FROM Sellers WHERE UserName = ? COLLATE NOCASE';
  return db.prepare(sql).get(/^\d+$/.test(key) ? Number(key) : key);
}

export function listTenants() {
  return db.prepare('SELECT Id, Name, UserName FROM Sellers ORDER BY Id').all();
}

export function getTenantInfo(sellerId) {
  return db.prepare(`
    SELECT s.Id, s.Name, s.UserName, s.IsApproved, s.CreatedAt,
      (SELECT COUNT(*) FROM Catalogs c WHERE c.SellerId = s.Id) AS CatalogCount,
      (SELECT COUNT(*) FROM Products p JOIN Catalogs c ON c.Id = p.CatalogId WHERE c.SellerId = s.Id) AS ProductCount,
      (SELECT COUNT(*) FROM Orders o WHERE o.SellerId = s.Id) AS OrderCount
    FROM Sellers s WHERE s.Id = ?`).get(sellerId);
}

export function listCatalogs(sellerId) {
  return db.prepare(`
    SELECT c.Id, c.Name, c.Description, c.IsApproved, c.CreatedAt,
      (SELECT COUNT(*) FROM Products p WHERE p.CatalogId = c.Id) AS ProductCount
    FROM Catalogs c WHERE c.SellerId = ? ORDER BY c.Id`).all(sellerId);
}

export function searchProducts(sellerId, f) {
  const where = ['c.SellerId = ?'];
  const args = [sellerId];
  if (f.query) {
    where.push('(p.Name LIKE ? OR p.Summary LIKE ? OR p.SupplierName LIKE ?)');
    const like = `%${f.query}%`;
    args.push(like, like, like);
  }
  if (f.catalogId != null) { where.push('p.CatalogId = ?'); args.push(f.catalogId); }
  if (f.supplier) { where.push('p.SupplierName LIKE ?'); args.push(`%${f.supplier}%`); }
  if (f.minPrice != null) { where.push('p.Price >= ?'); args.push(f.minPrice); }
  if (f.maxPrice != null) { where.push('p.Price <= ?'); args.push(f.maxPrice); }
  if (f.availableOnly) where.push('p.IsAvailable = 1');

  const from = `FROM Products p JOIN Catalogs c ON c.Id = p.CatalogId WHERE ${where.join(' AND ')}`;
  const total = db.prepare(`SELECT COUNT(*) AS n ${from}`).get(...args).n;
  const items = db.prepare(`
    SELECT p.Id, p.CatalogId, c.Name AS CatalogName, p.Name, p.Summary, p.Price,
           p.SupplierName, p.IsAvailable, p.IsDownloadable
    ${from} ORDER BY p.Name LIMIT ? OFFSET ?`).all(...args, f.limit, f.offset);
  return { total, limit: f.limit, offset: f.offset, items };
}

export function getProduct(sellerId, productId) {
  return db.prepare(`
    SELECT p.*, c.Name AS CatalogName
    FROM Products p JOIN Catalogs c ON c.Id = p.CatalogId
    WHERE c.SellerId = ? AND p.Id = ?`).get(sellerId, productId);
}

export function listOrders(sellerId, f) {
  const where = ['o.SellerId = ?'];
  const args = [sellerId];
  if (f.status != null) { where.push('o.Status = ?'); args.push(f.status); }
  if (f.catalogId != null) { where.push('o.CatalogId = ?'); args.push(f.catalogId); }
  return db.prepare(`
    SELECT o.Id, o.CatalogId, o.CreatedAt, o.BillingFirst, o.BillingLast, o.BillingEmailAddress,
           o.SubTotal, o.TaxAmount, o.Total, o.Status, o.ShippingProvider, o.TrackingCode,
           (SELECT COUNT(*) FROM OrderLines l WHERE l.OrderId = o.Id) AS LineCount
    FROM Orders o WHERE ${where.join(' AND ')}
    ORDER BY o.CreatedAt DESC LIMIT ?`).all(...args, f.limit).map(withStatus);
}

export function getOrder(sellerId, orderId) {
  const order = withStatus(db.prepare('SELECT * FROM Orders WHERE SellerId = ? AND Id = ?').get(sellerId, orderId));
  if (!order) return undefined;
  order.Lines = db.prepare(`
    SELECT Id, ProductId, ProductName, Quantity, UnitPrice, ExtendedPrice
    FROM OrderLines WHERE OrderId = ? ORDER BY Id`).all(orderId);
  return order;
}

export function salesSummary(sellerId) {
  const byCatalog = db.prepare(`
    SELECT c.Id AS CatalogId, c.Name AS CatalogName,
           COUNT(o.Id) AS Orders,
           COALESCE(SUM(CASE WHEN o.Status <> 100 THEN o.Total END), 0) AS Revenue
    FROM Catalogs c LEFT JOIN Orders o ON o.CatalogId = c.Id AND o.SellerId = c.SellerId
    WHERE c.SellerId = ? GROUP BY c.Id ORDER BY c.Id`).all(sellerId);
  const byStatus = db.prepare(`
    SELECT Status, COUNT(*) AS Orders, SUM(Total) AS Total
    FROM Orders WHERE SellerId = ? GROUP BY Status ORDER BY Status`).all(sellerId).map(withStatus);
  const topProducts = db.prepare(`
    SELECT l.ProductId, l.ProductName, SUM(l.Quantity) AS Units, SUM(l.ExtendedPrice) AS Revenue
    FROM OrderLines l JOIN Orders o ON o.Id = l.OrderId
    WHERE o.SellerId = ? AND o.Status <> 100
    GROUP BY l.ProductId ORDER BY Revenue DESC LIMIT 5`).all(sellerId);
  return { byCatalog, byStatus, topProducts, note: 'Revenue excludes Failed orders.' };
}
