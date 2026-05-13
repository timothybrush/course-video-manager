# Diagram prototype — verdicts

Two throwaway routes:

- `/prototype/diagram-parent` — opens the playground, receives focus events, can request a flush
- `/prototype/diagram-playground` — TLDraw mounted, autosaves head to `localStorage["proto-diagram-head"]` on 500ms debounce, answers flush with ack

Run: `pnpm dev`, open `/prototype/diagram-parent`.

## Questions to answer (fill these in after playing)

1. **`window.open` with a fixed name — idempotent on Chromium?**
   Spawn playground, click "Spawn playground" again. Does focus move to existing window or does a new one open?
   - Verdict:

2. **Child survives parent reload?**
   Spawn, then click "Reload parent". Does the playground window stay open? Can the _new_ parent re-acquire it by calling `window.open(url, "cvm-diagrams")` again? (Probably yes for the window, but `postMessage` handle is fresh — the _old_ `childRef` is gone after reload. The "re-acquire by name" call returns a Window handle to the existing window.)
   - Verdict: ✓ Playground survives parent reload. New parent re-acquires the window by name and postMessage works again.

3. **TLDraw — synchronous snapshot read?**
   `getSnapshot(editor.store)` is used inside the flush handler. Confirm: returns immediately, no await.
   - Verdict: ✓ Synchronous. Confirmed by round-trip on 2026-05-13 — drew "Foobar", flushed, full document with shape arrived in localStorage including position and richText.

4. **TLDraw — right event for "edits happened, debounce-flush"?**
   Using `editor.store.listen(cb, { source: "user", scope: "document" })`. Confirm: fires on user edits (drag/draw/delete) but NOT on camera pan/zoom or selection.
   - Verdict:

5. **Focus events — does TLDraw swallow window focus?**
   Click on the TLDraw canvas in the playground window. Does the parent receive a `focus` event?
   - Verdict:
   - If TLDraw swallows it, fall back to: parent listens for `blur` on itself, OR child sends focus on `mousedown`/`keydown` inside the canvas.

6. **Flush latency**
   "Flush + read head" round-trip: spawn → draw a shape → immediately flush. Does the new shape appear in the head readout? (Tests that synchronous save inside flush handler beats the 500ms debounce.)
   - Verdict: ✓ Shape captured on immediate flush. The flush handler cancels the pending debounce timer and serializes synchronously.

## Schema versioning

`getSnapshot` returns `{ document, session }`. `document` is `{ store, schema }` — `schema` contains version sequences for every shape type, used by TLDraw for migrations across SDK upgrades.

**Decision (2026-05-13):** persist `snap.document` (store + schema), drop `snap.session` (camera, selection, focus mode — per-window UI state, not part of the diagram).

## Notes for the real design

- localStorage is a stand-in for the real autosave API (`PATCH /api/diagrams/:id` debounced). The postMessage round-trip mechanics are what we're testing — the storage backend swap is mechanical.
- `flushAck` carries a `shapeCount` purely as evidence the child re-serialized; real version will not need it (parent reads head from server after ack).
- Cross-origin is not exercised — both routes are same-origin, which matches the design.

## To delete when done

```
rm app/routes/prototype.diagram-parent.tsx
rm app/routes/prototype.diagram-playground.tsx
rm app/prototype-diagram-NOTES.md
npm uninstall tldraw  # if not adopting
```
