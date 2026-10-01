# Driver one-viewport UX

Persistent map + bottom offer sheet.

```text
OFFLINE → ONLINE → OFFERED → RESERVED → EN_ROUTE → ARRIVED → WAITING → PIN_VERIFIED → ON_TRIP → COMPLETED → ONLINE
                    │
                    └─ DECLINE/TIMEOUT → ONLINE
```

The driver never receives a second active ride while holding a reservation or active trip. Database uniqueness plus reservation locking enforce this; UI state is not a security boundary.
