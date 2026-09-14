<?php
// Motor de cálculo de cotización — traducción 1:1 de web/src/lib/pricing.ts
// (ya probado exhaustivamente en el stack Node). Usado tanto en admin/ (para
// mostrar el desglose de una cotización ya guardada) como en web/
// (api-quote-submit.php, que SIEMPRE recalcula todo de nuevo acá — nunca
// confía en un total que mande el navegador).

const DEPOSIT_RATE = 0.3;

// $input: [
//   'basePriceClp' => int|null, 'priceUnit' => 'per_person'|'per_couple'|null,
//   'adults' => int, 'children' => int,
//   'selectedAddonIds' => string[], 'addons' => [['id','name','priceClp'], ...],
//   'roomOptionId' => string|null, 'roomOptions' => [['id','label','priceAdjustmentClp'], ...],
// ]
function calculate_quote(array $input): array {
    $adults = max(0, (int) ($input['adults'] ?? 0));
    $children = max(0, (int) ($input['children'] ?? 0));
    $passengers = $adults + $children;

    $unit = $input['priceUnit'] ?? 'per_person';
    $basePriceClp = $input['basePriceClp'] ?? null;

    $perPersonBase = null;
    $passengersSubtotal = null;
    if ($basePriceClp !== null) {
        $perPersonBase = $unit === 'per_couple' ? $basePriceClp / 2 : $basePriceClp;
        $passengersSubtotal = $passengers > 0 ? $perPersonBase * $passengers : 0;
    }

    $selectedAddonIds = $input['selectedAddonIds'] ?? [];
    $selectedAddons = array_values(array_filter(
        $input['addons'] ?? [],
        fn($a) => in_array($a['id'], $selectedAddonIds, true)
    ));
    $addonsTotal = array_reduce($selectedAddons, fn($sum, $a) => $sum + $a['priceClp'], 0);

    $selectedRoom = null;
    if (!empty($input['roomOptionId'])) {
        foreach (($input['roomOptions'] ?? []) as $r) {
            if ($r['id'] === $input['roomOptionId']) {
                $selectedRoom = $r;
                break;
            }
        }
    }
    $roomAdjustment = $selectedRoom['priceAdjustmentClp'] ?? 0;

    $total = $passengersSubtotal !== null
        ? max(0, $passengersSubtotal + $addonsTotal + $roomAdjustment)
        : null;

    return [
        'passengers' => $passengers,
        'perPersonBase' => $perPersonBase,
        'passengersSubtotal' => $passengersSubtotal,
        'addonsTotal' => $addonsTotal,
        'selectedAddons' => $selectedAddons,
        'roomAdjustment' => $roomAdjustment,
        'selectedRoomLabel' => $selectedRoom['label'] ?? null,
        'total' => $total,
        'depositSuggested' => $total !== null ? (int) round($total * DEPOSIT_RATE) : null,
    ];
}
