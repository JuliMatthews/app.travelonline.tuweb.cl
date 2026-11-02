<?php
// Lector/escritor mínimo de .xlsx (sin librerías: solo ZipArchive + SimpleXML, que vienen con PHP).
// Escribe textos como inlineStr y soporta: encabezado con estilo, celdas resaltadas, anchos de columna,
// fila fija, listas desplegables. Lee los .xlsx que guarda Excel/LibreOffice/Google Sheets (textos compartidos).

const XLSX_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

// Estilos: índices de cellXfs en styles.xml.
const XS_DEFAULT = 0, XS_HEADER = 1, XS_MISSING = 2, XS_LOCKED = 3, XS_TITLE = 4, XS_NOTE = 5;

function xlsx_available(): bool { return class_exists('ZipArchive') && function_exists('simplexml_load_string'); }

function xlsx_col(int $i): string { // 0 → A, 26 → AA
    $s = '';
    for ($i++; $i > 0; $i = intdiv($i - 1, 26)) $s = chr(65 + ($i - 1) % 26) . $s;
    return $s;
}

function xlsx_esc(string $s): string {
    $s = preg_replace('/[^\x{9}\x{A}\x{D}\x{20}-\x{D7FF}\x{E000}-\x{FFFD}]/u', '', $s) ?? '';
    return htmlspecialchars($s, ENT_XML1 | ENT_QUOTES, 'UTF-8');
}

/**
 * $sheets: [['name'=>…, 'widths'=>[22,30,…], 'freeze'=>true, 'rows'=>[[cell,…],…], 'lists'=>[['col'=>3,'values'=>['a','b']],…]], …]
 * cell = null | string | int | float | ['v'=>…, 's'=>XS_*]. La fila 1 se estiliza como encabezado si 'header' => true.
 * Devuelve el contenido binario del .xlsx.
 */
function xlsx_build(array $sheets): string {
    $tmp = tempnam(sys_get_temp_dir(), 'xlsx');
    $zip = new ZipArchive();
    if ($zip->open($tmp, ZipArchive::OVERWRITE) !== true) throw new RuntimeException('No se pudo crear el archivo');
    $decl = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

    $ct = $decl . '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
        . '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        . '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>';
    $wbSheets = '';
    $wbRels = '';
    foreach ($sheets as $i => $sh) {
        $n = $i + 1;
        $ct .= '<Override PartName="/xl/worksheets/sheet' . $n . '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
        $wbSheets .= '<sheet name="' . xlsx_esc(mb_substr($sh['name'], 0, 31)) . '" sheetId="' . $n . '" r:id="rId' . $n . '"/>';
        $wbRels .= '<Relationship Id="rId' . $n . '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' . $n . '.xml"/>';
    }
    $ct .= '</Types>';
    $wbRels .= '<Relationship Id="rId' . (count($sheets) + 1) . '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>';

    $zip->addFromString('[Content_Types].xml', $ct);
    $zip->addFromString('_rels/.rels', $decl . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
    $zip->addFromString('xl/workbook.xml', $decl . '<workbook xmlns="' . XLSX_NS . '" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' . $wbSheets . '</sheets></workbook>');
    $zip->addFromString('xl/_rels/workbook.xml.rels', $decl . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' . $wbRels . '</Relationships>');

    $border = '<border><left style="thin"><color rgb="FFD5D9E0"/></left><right style="thin"><color rgb="FFD5D9E0"/></right><top style="thin"><color rgb="FFD5D9E0"/></top><bottom style="thin"><color rgb="FFD5D9E0"/></bottom><diagonal/></border>';
    $zip->addFromString('xl/styles.xml', $decl . '<styleSheet xmlns="' . XLSX_NS . '">'
        . '<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="15"/><color rgb="FF2D4874"/><name val="Calibri"/></font><font><i/><sz val="10"/><color rgb="FF6B7385"/><name val="Calibri"/></font></fonts>'
        . '<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
        . '<fill><patternFill patternType="solid"><fgColor rgb="FF2D4874"/></patternFill></fill>'
        . '<fill><patternFill patternType="solid"><fgColor rgb="FFFFF2B3"/></patternFill></fill>'
        . '<fill><patternFill patternType="solid"><fgColor rgb="FFEDEFF3"/></patternFill></fill></fills>'
        . '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' . $border . '</borders>'
        . '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        . '<cellXfs count="6">'
        . '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>'
        . '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>'
        . '<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>'
        . '<xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>'
        . '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
        . '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>'
        . '</cellXfs></styleSheet>');

    foreach ($sheets as $i => $sh) {
        $cols = '';
        foreach (($sh['widths'] ?? []) as $c => $w) $cols .= '<col min="' . ($c + 1) . '" max="' . ($c + 1) . '" width="' . $w . '" customWidth="1"/>';
        $rowsXml = '';
        foreach ($sh['rows'] as $r => $row) {
            $cells = '';
            foreach ($row as $c => $cell) {
                $style = XS_DEFAULT;
                if (is_array($cell)) { $style = $cell['s'] ?? XS_DEFAULT; $cell = $cell['v'] ?? null; }
                elseif (($sh['header'] ?? false) && $r === 0) $style = XS_HEADER;
                $ref = xlsx_col($c) . ($r + 1);
                if ($cell === null || $cell === '') $cells .= '<c r="' . $ref . '" s="' . $style . '"/>';
                elseif (is_int($cell) || is_float($cell)) $cells .= '<c r="' . $ref . '" s="' . $style . '"><v>' . $cell . '</v></c>';
                else $cells .= '<c r="' . $ref . '" s="' . $style . '" t="inlineStr"><is><t xml:space="preserve">' . xlsx_esc((string) $cell) . '</t></is></c>';
            }
            $ht = ($sh['header'] ?? false) && $r === 0 ? ' ht="32" customHeight="1"' : '';
            $rowsXml .= '<row r="' . ($r + 1) . '"' . $ht . '>' . $cells . '</row>';
        }
        $pane = ($sh['freeze'] ?? false) ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' : '';
        $dv = '';
        foreach (($sh['lists'] ?? []) as $l) {
            $col = xlsx_col($l['col']);
            $dv .= '<dataValidation type="list" allowBlank="1" showErrorMessage="1" errorTitle="Valor no válido" error="Elige una opción de la lista." sqref="' . $col . '2:' . $col . '600"><formula1>"' . xlsx_esc(implode(',', $l['values'])) . '"</formula1></dataValidation>';
        }
        $zip->addFromString('xl/worksheets/sheet' . ($i + 1) . '.xml', $decl . '<worksheet xmlns="' . XLSX_NS . '"><sheetViews><sheetView workbookViewId="0"' . ($i === 0 ? ' tabSelected="1"' : '') . '>' . $pane . '</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>'
            . ($cols ? '<cols>' . $cols . '</cols>' : '') . '<sheetData>' . $rowsXml . '</sheetData>'
            . ($dv ? '<dataValidations count="' . count($sh['lists']) . '">' . $dv . '</dataValidations>' : '') . '</worksheet>');
    }
    $zip->close();
    $bin = file_get_contents($tmp);
    @unlink($tmp);
    return $bin;
}

// Texto de un <si> o <is>: puede venir directo (<t>) o en tramos con formato (<r><t>).
function xlsx_text(SimpleXMLElement $n): string {
    $c = $n->children(XLSX_NS);
    $t = (string) $c->t;
    foreach ($c->r as $r) $t .= (string) $r->children(XLSX_NS)->t;
    return $t;
}

/** Lee un .xlsx. Devuelve [nombre de hoja => [nº de fila => [columna(0=A) => texto]]]. */
function xlsx_read(string $path): array {
    $zip = new ZipArchive();
    if ($zip->open($path) !== true) throw new RuntimeException('El archivo no es un Excel (.xlsx) válido');
    $get = fn(string $n) => ($s = $zip->getFromName($n)) === false ? null : $s;
    $wb = $get('xl/workbook.xml');
    $rels = $get('xl/_rels/workbook.xml.rels');
    if ($wb === null || $rels === null) throw new RuntimeException('El archivo no es un Excel (.xlsx) válido');

    $shared = [];
    if (($ss = $get('xl/sharedStrings.xml')) !== null) {
        foreach (simplexml_load_string($ss)->children(XLSX_NS)->si as $si) $shared[] = xlsx_text($si);
    }
    $targets = [];
    foreach (simplexml_load_string($rels)->Relationship as $r) $targets[(string) $r->attributes()['Id']] = (string) $r->attributes()['Target'];

    $out = [];
    foreach (simplexml_load_string($wb)->children(XLSX_NS)->sheets->children(XLSX_NS)->sheet as $sheet) {
        $rid = (string) $sheet->attributes('http://schemas.openxmlformats.org/officeDocument/2006/relationships')['id'];
        $target = $targets[$rid] ?? null;
        if (!$target) continue;
        $xml = $get(ltrim(str_starts_with($target, '/') ? $target : 'xl/' . $target, '/'));
        if ($xml === null) continue;
        $rows = [];
        foreach (simplexml_load_string($xml)->children(XLSX_NS)->sheetData->children(XLSX_NS)->row as $row) {
            $line = [];
            foreach ($row->children(XLSX_NS)->c as $c) {
                if (!preg_match('/^([A-Z]+)(\d+)$/', (string) $c->attributes()['r'], $m)) continue;
                $ci = 0;
                foreach (str_split($m[1]) as $ch) $ci = $ci * 26 + (ord($ch) - 64);
                $t = (string) $c->attributes()['t'];
                $cc = $c->children(XLSX_NS);
                if ($t === 's') $val = $shared[(int) $cc->v] ?? '';
                elseif ($t === 'inlineStr') $val = xlsx_text($cc->is);
                else {
                    $val = (string) $cc->v;
                    if ($t === '' && is_numeric($val) && str_contains($val, '.') && (float) $val == floor((float) $val)) $val = (string) (int) $val;
                }
                $line[$ci - 1] = $val;
            }
            $rows[(int) $row->attributes()['r']] = $line;
        }
        $out[(string) $sheet->attributes()['name']] = $rows;
    }
    $zip->close();
    return $out;
}
