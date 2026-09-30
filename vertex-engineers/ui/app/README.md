# VERTEX Engineers integrated UI

Entry point: `index.html`

This is the code-integrated VERTEX Engineers design. It replaces the old concept of many top-level engineering screens with six simple work areas:

1. Dashboard
2. Projects
3. Equipment
4. Service
5. Team
6. Documents

## Design

The shell uses the reviewed VERTEX Engineers visual direction:

- graphite / steel foundation
- warm sand VERTEX accent
- ivory work surface
- restrained status colors
- responsive desktop/mobile layout

## Current behavior

The preview is intentionally honest about runtime status:

- navigation works;
- responsive shell works;
- actions explain which API/runtime capability will be used;
- no fake project/equipment/customer records are inserted;
- no request is sent to production;
- no VERTEX Vision private code is imported;
- staging persistence is not presented as connected.

## Future mount

The same UI information architecture is intended for the future VERTEX VISION `/engineers` mount after identity, persistence and staging E2E gates are complete.
