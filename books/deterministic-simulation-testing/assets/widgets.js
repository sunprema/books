/* Deterministic Simulation Testing — book-specific canvas widgets.
   Runs on top of the vendored assets/vendor/book-widgets.js runtime
   (BookWidgets.register(name, init) — see that file's header for the API).
   Stub only: no widgets are registered yet. Each concept page build should
   add exactly the widgets it needs here, e.g.:
     - a seeded replay strip (same seed -> identical event timeline;
       flipping one bit in the seed fans the trace out) for
       "the-determinism-contract" and "workloads-and-state-space-exploration"
     - a tiny discrete-event scheduler / event-queue visualizer for
       "building-the-simulator"
     - a fault-injection timeline (network/disk/clock faults dropped onto a
       run) for "fault-models"
   Keep widgets deterministic (W.rng(seed), never Math.random), time-based
   (tick(dt)), and redraw on W.onRelayout — see the runtime README. */
