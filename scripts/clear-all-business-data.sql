-- 清空所有业务数据（保留认证系统）
-- 执行顺序：先删外键依赖的表，再删被依赖的表

PRAGMA foreign_keys = ON;

-- 1. 删除销售相关
DELETE FROM sales_items;
DELETE FROM sales_orders;

-- 2. 删除进货相关
DELETE FROM purchase_items;
DELETE FROM purchase_orders;

-- 3. 删除库存相关
DELETE FROM stock_movements;
DELETE FROM stock_movements_new;
DELETE FROM stock_transfers;
DELETE FROM inventory_balances;

-- 4. 删除商品
DELETE FROM products;

-- 5. 删除图片资产
DELETE FROM image_assets;

-- 6. 删除旧版记录
DELETE FROM vending_record_image_chunks;
DELETE FROM vending_record_images;
DELETE FROM vending_records;

-- 7. 删除外部集成数据
DELETE FROM external_inventory_snapshots;
DELETE FROM external_product_mappings;
DELETE FROM external_sales_imports;
DELETE FROM external_settlement_imports;
DELETE FROM external_sync_runs;

-- 验证：确认关键表已清空
SELECT 'products' as table_name, COUNT(*) as row_count FROM products
UNION ALL
SELECT 'purchase_orders', COUNT(*) FROM purchase_orders
UNION ALL
SELECT 'sales_orders', COUNT(*) FROM sales_orders
UNION ALL
SELECT 'stock_movements', COUNT(*) FROM stock_movements
UNION ALL
SELECT 'inventory_balances', COUNT(*) FROM inventory_balances
UNION ALL
SELECT 'image_assets', COUNT(*) FROM image_assets;
