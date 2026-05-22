<?php
function format_tax(float $amount, string $currency): string
{
    return $currency . number_format($amount, 2);
}
