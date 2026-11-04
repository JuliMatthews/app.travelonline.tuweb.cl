-- Limpieza de datos de demostración en PRODUCCIÓN (operadores de ejemplo: Nogatur Chile, LATAM Airlines, MSC Cruceros, etc.).
-- Los operadores reales (Mas Europa, Fantástica China…) tienen is_demo = 0 y NO se tocan.
-- Los programas ligados a un operador demo quedan "Sin proveedor" (la llave es ON DELETE SET NULL) y las solicitudes
-- que lo usaban quedan "Sin operador". Respaldar la BD antes y revisar el SELECT de abajo antes de borrar.
SELECT id, name, kind, is_demo,
       (SELECT COUNT(*) FROM packages p WHERE p.operator_id = o.id) AS programas,
       (SELECT COUNT(*) FROM quote_requests q WHERE q.operator_id = o.id) AS solicitudes
FROM operators o ORDER BY is_demo DESC, name;

DELETE FROM operators WHERE is_demo = 1;

SELECT id, name, kind, commission_pct, markup_pct, is_demo FROM operators ORDER BY name;
