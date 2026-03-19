SELECT * FROM local_config;
UPDATE local_config SET store_id = '1234' WHERE store_id = 'default-store';
SELECT * FROM local_config;
