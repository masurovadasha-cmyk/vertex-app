# Uzbekistan compliance research snapshot

Research snapshot: 2026-10-01. This file is product/compliance architecture input, not legal advice.

## Elevators

### UzTR.430-025:2025

The Uzbekistan technical regulation "On safety of elevators and elevator equipment" (UzTR.430-025:2025), approved by Cabinet of Ministers Resolution No. 430 dated 2025-07-12, entered into force on 2026-07-01.

Official source:
https://gov.uz/ru/standart/activity_page/texnik-reglamentlar

### Safe Lift

The Committee for Industrial, Radiation and Nuclear Safety states that newly installed elevators in newly constructed buildings and multi-apartment residential complexes must be registered through the "Safe Lift" interagency electronic platform. The service-provider registry includes license/permit status and information about elevator service specialists.

Official source:
https://gov.uz/en/cirns/news/view/67782

### Product requirement for VERTEX Engineers

The software must support:

- elevator registration reference/status
- installation/repair license or permit records
- validity periods
- specialist qualification/certificate records
- inspection and commissioning documents
- asset serial/model/site history
- maintenance schedule and immutable service history
- expiry alerts
- incident and emergency work orders

## HVAC / engineering design

The Ministry of Construction and Housing and Communal Services publishes licensing requirements for architectural and urban-planning documentation. The listed engineering-system scope includes heating, ventilation and air conditioning, and the published requirements include qualified specialists and quality-control obligations.

Official source:
https://digital.gov.uz/ru/mc/sections/view/38346

The current government licensing platform should be used to re-check the exact license/permit workflow applicable to a specific project and activity.

Official source:
https://gov.uz/en/pages/Elektron_litsenziyalash_tizimi

## Engineering rule

Compliance requirements are configuration/data, not hard-coded assumptions. Store jurisdiction, rule version, effective date, source URL and verification date so future regulatory changes can be applied without rewriting the domain model.
