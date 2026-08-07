import { browser } from "$app/environment";
import { writable, type Writable } from "svelte/store";

// Persisted boolean prefs shared between the inline terminal and the fullscreen
// terminal, so toggling one in Preferences affects both renderers identically.
function persistedBoolean(key: string, defaultValue: boolean): Writable<boolean> {
  const stored = browser ? window.localStorage.getItem(key) : null;
  const initialValue = stored !== null ? stored === "true" : defaultValue;

  const store = writable(initialValue);

  store.subscribe((value) => {
    if (browser) {
      window.localStorage.setItem(key, value.toString());
    }
  });

  return store;
}

export const condenseTimestamps = persistedBoolean("terminalCondenseTimestamps", true);
export const groupSimilarLines = persistedBoolean("terminalGroupSimilarLines", true);
export const showLineNumbers = persistedBoolean("terminalShowLineNumbers", false);
// "Line Condensation" clamps every console row to two UI lines (click-to-expand)
export const lineCondensation = persistedBoolean("terminalLineCondensation", true);
