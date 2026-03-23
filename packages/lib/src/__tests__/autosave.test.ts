import { describe, expect, it } from "vitest";

import { shouldAutosaveDraft } from "../report-engine";

describe("autosave behavior", () => {
  it("autosaves when the timer threshold has elapsed", () => {
    expect(shouldAutosaveDraft({ dirty: true, millisecondsSinceLastSave: 3500, sectionChanged: false })).toBe(true);
  });

  it("autosaves immediately on section change when dirty", () => {
    expect(shouldAutosaveDraft({ dirty: true, millisecondsSinceLastSave: 200, sectionChanged: true })).toBe(true);
  });

  it("does not autosave a clean draft", () => {
    expect(shouldAutosaveDraft({ dirty: false, millisecondsSinceLastSave: 5000, sectionChanged: true })).toBe(false);
  });

  it("does not start another autosave while one is already in flight", () => {
    expect(shouldAutosaveDraft({ dirty: true, millisecondsSinceLastSave: 5000, sectionChanged: false, saveInFlight: true })).toBe(false);
  });
});
