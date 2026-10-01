# Pricing Engine

`FareQuote` is immutable after issuance.

Inputs: market/version, service class, route distance/duration, pickup fee, waiting policy, demand multiplier, zone/airport modifiers, promotion and taxes/fees.

Quote stores normalized inputs, `pricing_version`, calculation components, integer minor-unit amount, currency and expiry.

No floating-point money. Settlement adjustments are explicit: route change, additional stop, waiting, toll/fee or approved manual adjustment.
