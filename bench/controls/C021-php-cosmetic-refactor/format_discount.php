<?php
// Equivalent logic written with a variable instead of inline expression.
// Semantically identical to format_price and format_tax.
function format_discount(float $amount, string $currency): string
{
    $formatted = number_format($amount, 2);
    return $currency . $formatted;
}
