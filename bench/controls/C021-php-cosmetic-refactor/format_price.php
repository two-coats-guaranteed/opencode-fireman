<?php
function format_price(float $amount, string $currency): string
{
    return $currency . number_format($amount, 2);
}
