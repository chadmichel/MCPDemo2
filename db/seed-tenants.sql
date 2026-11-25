-- Seed data so every tenant (Seller) has its own catalogs, products and orders.
-- The original eCommerce-Core database only has data for Seller 1 (santi).
-- Idempotent: uses fixed ids with INSERT OR IGNORE.
--   sqlite3 db/db.sqlite < db/seed-tenants.sql

BEGIN;

-- Tenant 2: Movie Shack of Russ ------------------------------------------
INSERT OR IGNORE INTO Catalogs (Id, SellerId, Name, Description, IsApproved) VALUES
  (3, 2, 'Russ''s Classic Movies', 'Classic films on DVD and Blu-ray', 1),
  (4, 2, 'Russ''s Digital Downloads', 'Downloadable movies', 1);

INSERT OR IGNORE INTO Products (Id, CatalogId, SellerProductId, Name, Summary, Detail, Price, SupplierName, ShippingWeight, IsAvailable, IsDownloadable) VALUES
  (5001, 3, 'RM-001', 'Casablanca (1942) Blu-ray',          'Classic romance drama',  'Remastered Blu-ray',      19.99, 'Warner Bros', 0.20, 1, 0),
  (5002, 3, 'RM-002', 'The Godfather (1972) Blu-ray',       'Crime epic',             'Collector''s edition',    24.99, 'Paramount',   0.20, 1, 0),
  (5003, 3, 'RM-003', 'Jaws (1975) DVD',                    'Summer blockbuster',     'Widescreen DVD',           9.99, 'Universal',   0.15, 1, 0),
  (5004, 3, 'RM-004', 'Star Wars (1977) Blu-ray',           'Space opera',            'Original theatrical cut', 29.99, 'Lucasfilm',   0.20, 0, 0),
  (5005, 3, 'RM-005', 'Back to the Future (1985) DVD',      'Time travel comedy',     'Widescreen DVD',          12.99, 'Universal',   0.15, 1, 0),
  (5006, 3, 'RM-006', 'The Princess Bride (1987) Blu-ray',  'Fairy tale adventure',   '25th anniversary',        17.99, 'MGM',         0.20, 1, 0),
  (5007, 4, 'RD-001', 'Jurassic Park (1993) Digital',       'Dinosaur thriller',      '4K digital download',     14.99, 'Universal',   0.00, 1, 1),
  (5008, 4, 'RD-002', 'The Matrix (1999) Digital',          'Sci-fi action',          '4K digital download',     14.99, 'Warner Bros', 0.00, 1, 1),
  (5009, 4, 'RD-003', 'Toy Story (1995) Digital',           'Animated family film',   'HD digital download',      9.99, 'Pixar',       0.00, 1, 1),
  (5010, 4, 'RD-004', 'Groundhog Day (1993) Digital',       'Comedy',                 'HD digital download',      7.99, 'Columbia',    0.00, 1, 1);

-- Tenant 3: Kyle's Food --------------------------------------------------
INSERT OR IGNORE INTO Catalogs (Id, SellerId, Name, Description, IsApproved) VALUES
  (5, 3, 'Kyle''s Pantry', 'Shelf-stable groceries and snacks', 1);

INSERT OR IGNORE INTO Products (Id, CatalogId, SellerProductId, Name, Summary, Detail, Price, SupplierName, ShippingWeight, IsAvailable, IsDownloadable) VALUES
  (6001, 5, 'KF-001', 'Nebraska Sweet Corn Salsa',     '16oz jar',            'Medium heat',          6.49, 'Husker Harvest', 1.10, 1, 0),
  (6002, 5, 'KF-002', 'Runza Seasoning Blend',         '4oz shaker',          'Beef & cabbage blend', 4.99, 'Plains Spice Co', 0.30, 1, 0),
  (6003, 5, 'KF-003', 'Smoked Beef Jerky',             '8oz bag',             'Hickory smoked',      12.99, 'Sandhills Smokehouse', 0.55, 1, 0),
  (6004, 5, 'KF-004', 'Honey Wheat Pancake Mix',       '2lb box',             'Just add water',       7.25, 'Prairie Mills', 2.10, 1, 0),
  (6005, 5, 'KF-005', 'Wildflower Honey',              '12oz bottle',         'Raw, unfiltered',      9.50, 'Platte Valley Bees', 0.90, 1, 0),
  (6006, 5, 'KF-006', 'Kolache Baking Kit',            'Makes 24 kolaches',   'Apricot & poppyseed',  18.00, 'Wilber Bakery', 3.00, 0, 0),
  (6007, 5, 'KF-007', 'Popcorn Kernels',               '5lb bag',             'Yellow butterfly',     8.99, 'Husker Harvest', 5.10, 1, 0),
  (6008, 5, 'KF-008', 'Cherry Mash Candy Bar 12-pack', '12 bars',             'Classic Midwest treat', 15.99, 'Chase General', 1.40, 1, 0);

-- Extra orders across all tenants ----------------------------------------
INSERT OR IGNORE INTO Orders (Id, FromCartId, BillingFirst, BillingLast, BillingEmailAddress, BillingCity, BillingState, BillingPostal,
  ShippingFirst, ShippingLast, ShippingEmailAddress, ShippingCity, ShippingState, ShippingPostal,
  CreatedAt, UpdatedAt, SubTotal, TaxAmount, Total, AuthorizationCode, ShippingProvider, TrackingCode, Notes, SellerId, CatalogId, Status) VALUES
  (2, NULL, 'Alice', 'Nguyen', 'alice@example.com', 'Omaha',   'NE', '68102', 'Alice', 'Nguyen', 'alice@example.com', 'Omaha',   'NE', '68102', '2025-08-01 10:00:00', '2025-08-03 09:00:00', 1996.00, 139.72, 2135.72, 'AUTH-2', 'UPS',   '1Z999AA10000000002', NULL, 1, 1, 20),
  (3, NULL, 'Marcus', 'Lee',   'marcus@example.com', 'Lincoln', 'NE', '68508', 'Marcus', 'Lee',   'marcus@example.com', 'Lincoln', 'NE', '68508', '2025-08-05 14:30:00', '2025-08-05 14:30:00',   44.98,   3.15,   48.13, 'AUTH-3', NULL,    NULL, NULL, 2, 3, 10),
  (4, NULL, 'Priya', 'Shah',   'priya@example.com',  'Denver',  'CO', '80202', 'Priya', 'Shah',   'priya@example.com',  'Denver',  'CO', '80202', '2025-08-07 08:15:00', '2025-08-09 12:00:00',   29.98,   2.10,   32.08, 'AUTH-4', NULL,    NULL, 'Digital delivery', 2, 4, 30),
  (5, NULL, 'Dana', 'Kowalski','dana@example.com',   'Kearney', 'NE', '68845', 'Dana', 'Kowalski','dana@example.com',   'Kearney', 'NE', '68845', '2025-08-10 16:45:00', '2025-08-12 10:00:00',   30.96,   2.17,   33.13, 'AUTH-5', 'USPS',  '9400100000000000000005', NULL, 3, 5, 20),
  (6, NULL, 'Sam', 'Ortiz',    'sam@example.com',    'Lincoln', 'NE', '68510', 'Sam', 'Ortiz',    'sam@example.com',    'Lincoln', 'NE', '68510', '2025-08-11 11:20:00', '2025-08-11 11:20:00',   18.00,   1.26,   19.26, NULL,     NULL,    NULL, 'Card declined', 3, 5, 100);

INSERT OR IGNORE INTO OrderLines (Id, OrderId, FromCartItemId, ProductId, Quantity, ProductName, CreatedAt, UpdatedAt, UnitPrice, ExtendedPrice) VALUES
  (2, 2, 0, 2,    1, '1997 Volvo 960',                   '2025-08-01 10:00:00', '2025-08-01 10:00:00', 1996.00, 1996.00),
  (3, 3, 0, 5001, 1, 'Casablanca (1942) Blu-ray',        '2025-08-05 14:30:00', '2025-08-05 14:30:00',   19.99,   19.99),
  (4, 3, 0, 5002, 1, 'The Godfather (1972) Blu-ray',     '2025-08-05 14:30:00', '2025-08-05 14:30:00',   24.99,   24.99),
  (5, 4, 0, 5007, 1, 'Jurassic Park (1993) Digital',     '2025-08-07 08:15:00', '2025-08-07 08:15:00',   14.99,   14.99),
  (6, 4, 0, 5008, 1, 'The Matrix (1999) Digital',        '2025-08-07 08:15:00', '2025-08-07 08:15:00',   14.99,   14.99),
  (7, 5, 0, 6001, 2, 'Nebraska Sweet Corn Salsa',        '2025-08-10 16:45:00', '2025-08-10 16:45:00',    6.49,   12.98),
  (8, 5, 0, 6003, 1, 'Smoked Beef Jerky',                '2025-08-10 16:45:00', '2025-08-10 16:45:00',   12.99,   12.99),
  (9, 5, 0, 6002, 1, 'Runza Seasoning Blend',            '2025-08-10 16:45:00', '2025-08-10 16:45:00',    4.99,    4.99),
  (10,6, 0, 6006, 1, 'Kolache Baking Kit',               '2025-08-11 11:20:00', '2025-08-11 11:20:00',   18.00,   18.00);

COMMIT;
