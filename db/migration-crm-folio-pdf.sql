-- CRM · (1) folios con prefijo TOL (Travel OnLine) en vez de WEB/TEL, y
-- (2) vínculo entre el historial de actividad y la versión de cotización (botón "Ver PDF").
-- Aditiva en estructura; solo renombra el prefijo de folios ya existentes (WEB-/TEL- → TOL-).
-- Requiere haber corrido antes migration-crm-cotizaciones.sql. Respaldar antes.

UPDATE quote_requests
  SET folio = CONCAT('TOL-', SUBSTRING(folio, 5))
  WHERE folio LIKE 'WEB-%' OR folio LIKE 'TEL-%';

ALTER TABLE quote_activity
  ADD COLUMN quotation_version_id INT NULL AFTER to_user_id,
  ADD CONSTRAINT quote_activity_version_fk FOREIGN KEY (quotation_version_id) REFERENCES quotation_versions(id) ON DELETE SET NULL;
