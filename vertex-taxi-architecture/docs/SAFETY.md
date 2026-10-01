# Safety / Support

Safety is a bounded context, not a UI flag.

Capabilities: identity/driver verification, PIN, trip sharing, masked communication, SOS, route deviation, unexpected stop, speed anomaly, incident creation, support and appeals.

Safety events are immutable/audited. Safety incidents reference the ride but do not own ride state transitions unless an explicit policy command does so.
