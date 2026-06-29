DELETE FROM vending_records
WHERE store = 'settings'
  AND record_id IN ('aiClientConfigs', 'aiActiveProvider');
