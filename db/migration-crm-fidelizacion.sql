-- CRM · fidelización: quién refirió a cada solicitud (correo del cliente que recomendó). Aditiva.
-- Los clientes recurrentes no necesitan tabla: se calculan agrupando por correo (o teléfono) en quote_requests.
ALTER TABLE quote_requests
  ADD COLUMN referred_by_email VARCHAR(190) NULL AFTER channel,
  ADD INDEX (referred_by_email);
