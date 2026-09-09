# Sarah voice API

See [Sarah's prompt, tool contract and activation instructions](../../../docs/sarah-agent.md).

Sarah uses the existing institute voice endpoints, phone routing and call log.
The legacy endpoint names `maccabi-slots` and `book-maccabi` are retained for compatibility.

Booking now verifies the submitted parent and teacher questionnaires and the
registered parent's phone against the case. Both slot discovery and booking
require eligibility. The permitted assessment starts are Wednesday 16:00,
17:00, 18:00 and 19:00 in Asia/Jerusalem; duration is always 60 minutes.

Calendar/database errors block booking. The shared reservation engine handles
concurrency and repeated voice calls. Confirmation messages use a persisted
single-send claim. MOXO requests are approved separately by authenticated staff.
