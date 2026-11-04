-- Origen del cliente + vincular solicitudes antiguas sueltas (client_id NULL).
-- Correr UNA vez (la columna ya existente hace fallar el ALTER, a propósito).
-- Valores de source: registro | google | cotizacion_web | rescatado | manual

ALTER TABLE clients ADD COLUMN source VARCHAR(20) NOT NULL DEFAULT 'cotizacion_web' AFTER phone;

-- Origen de los clientes ya existentes.
UPDATE clients SET source = 'registro' WHERE password_hash IS NOT NULL;
UPDATE clients SET source = 'google'   WHERE google_sub IS NOT NULL;
UPDATE clients c SET source = 'rescatado'
  WHERE c.password_hash IS NULL AND c.google_sub IS NULL
    AND EXISTS (SELECT 1 FROM quote_requests q WHERE q.client_id = c.id AND q.recovered = 1);

-- Clientes para cada correo con solicitudes sueltas (toma los datos de la más reciente).
INSERT INTO clients (id, email, name, phone, source)
SELECT UUID(), t.email, t.name, t.phone, 'cotizacion_web'
FROM (
  SELECT LOWER(TRIM(q.passenger_email)) AS email,
         SUBSTRING_INDEX(GROUP_CONCAT(q.passenger_name ORDER BY q.created_at DESC SEPARATOR '\n'), '\n', 1) AS name,
         SUBSTRING_INDEX(GROUP_CONCAT(q.passenger_phone ORDER BY q.created_at DESC SEPARATOR '\n'), '\n', 1) AS phone
  FROM quote_requests q
  WHERE q.client_id IS NULL AND q.passenger_email LIKE '%@%'
  GROUP BY LOWER(TRIM(q.passenger_email))
) t
WHERE NOT EXISTS (SELECT 1 FROM clients c WHERE c.email = t.email);

-- Vincular las solicitudes sueltas a su cliente por correo.
UPDATE quote_requests q JOIN clients c ON c.email = LOWER(TRIM(q.passenger_email))
SET q.client_id = c.id WHERE q.client_id IS NULL;
