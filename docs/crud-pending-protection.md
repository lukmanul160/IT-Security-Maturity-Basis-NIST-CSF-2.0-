CRUD pending protection
=======================

The browser coalesces identical concurrent same-origin API mutations into one
request. JSON object keys are normalized. Multipart requests use field values and
the identity of their selected files. Each caller receives a readable response.
Independent requests and GETs continue normally. Explicit AbortSignals and Request
objects keep their original cancellation semantics; server protection still applies.

Classic form guards disable submit, action and reset buttons throughout the complete
save workflow, including uploads and follow-up writes. Existing disabled states are
restored after completion or failure.

Authenticated API writes use PostgreSQL advisory locks. Identical JSON creates by
the same user share a key; multipart creates lock their endpoint per user. PUT,
PATCH and DELETE lock their resource path across users and ignore query strings.
Conflicts return 409 MUTATION_PENDING. Separate lock connections avoid starving
business transactions. At most four guarded operations per middleware can run;
excess requests return 429 MUTATION_CAPACITY rather than silently queuing.

Locks remain held if a browser disconnects while a handler is still writing. They
release when the handler ends its response; PostgreSQL also releases them when its
session closes. A disconnected request is not cancelled or automatically retried.

This prevents duplicate pending submissions. It is not permanent content uniqueness
or a durable replay receipt: a new submission after completion is a new operation.
Uncertain network outcomes after completion should be checked against the list
before resubmitting. Database constraints and transactional domain rules still apply.

Verification: test/mutationGuard.test.js, test/submissionGuard.test.js and
scripts/test-mutation-guard-browser.js. Browser verification uses a disposable
counter endpoint and does not insert application records.
