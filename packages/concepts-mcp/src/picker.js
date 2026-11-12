import { emitKeypressEvents } from "node:readline";
import { createInterface } from "node:readline/promises";

/**
 * Small terminal pickers with no dependencies: arrow keys (or j/k) move, number keys jump,
 * Enter chooses, Space toggles in a multi-select. Ctrl-C rejects with a CancelledError.
 */

export class CancelledError extends Error {
  constructor() { super("Cancelled. Nothing was changed."); }
}

const dim = (s) => `\x1b[2m${s}\x1b[22m`;
const bold = (s) => `\x1b[1m${s}\x1b[22m`;
const cyan = (s) => `\x1b[36m${s}\x1b[39m`;

// Options show just their name: the terminal pickers stay short. Descriptions are for the MCP form and agents.
const nameOf = (o) => o.pick ?? o.label;
const labelOf = (o) => `${nameOf(o)}${o.recommended ? dim(" (recommended)") : ""}`;

/** Shared key loop: draws with `draw()` (returns lines), feeds keys to `onKey`, which returns a result to finish. */
function run({ input, output, draw, onKey }) {
  return new Promise((resolve, reject) => {
    emitKeypressEvents(input);
    const raw = Boolean(input.isTTY && input.setRawMode);
    if (raw) input.setRawMode(true);
    input.resume();
    let drawn = 0;
    const paint = () => {
      const lines = draw();
      output.write(`${drawn ? `\x1b[${drawn}A\r\x1b[J` : ""}${lines.join("\n")}\n`);
      drawn = lines.length;
    };
    const finish = (fn, value, summary) => {
      input.off("keypress", handler);
      if (raw) input.setRawMode(false);
      input.pause();
      output.write(`${drawn ? `\x1b[${drawn}A\r\x1b[J` : ""}${summary ?? ""}`);
      fn(value);
    };
    const handler = (str, key = {}) => {
      if (key.ctrl && key.name === "c") return finish(reject, new CancelledError(), "\n");
      const result = onKey(str, key);
      if (result && "done" in result) return finish(resolve, result.done, result.summary);
      paint();
    };
    input.on("keypress", handler);
    paint();
  });
}

/** Pick one option. Resolves with the chosen option's index. */
export function select({ question, options, defaultIndex = 0, input = process.stdin, output = process.stdout }) {
  let at = defaultIndex;
  return run({
    input, output,
    draw: () => [
      `${cyan("?")} ${bold(question)}`,
      ...options.map((o, i) => `${i === at ? cyan("❯") : " "} ${i === at ? cyan(labelOf(o)) : labelOf(o)}`),
    ],
    onKey: (str, key) => {
      if (key.name === "up" || key.name === "k") at = (at - 1 + options.length) % options.length;
      else if (key.name === "down" || key.name === "j" || key.name === "tab") at = (at + 1) % options.length;
      else if (/^[1-9]$/.test(str ?? "") && Number(str) <= options.length) at = Number(str) - 1;
      else if (key.name === "return" || key.name === "enter") return { done: at, summary: `${cyan("✔")} ${question} ${dim("·")} ${nameOf(options[at])}\n` };
      return null;
    },
  });
}

/** Pick any number of options. Resolves with the chosen indexes, in option order. */
export function multiSelect({ question, options, checked = options.map((_, i) => i), min = 1, input = process.stdin, output = process.stdout }) {
  let at = 0;
  const on = new Set(checked);
  let warning = "";
  return run({
    input, output,
    draw: () => [
      `${cyan("?")} ${bold(question)}`,
      ...options.map((o, i) => `${i === at ? cyan("❯") : " "} ${on.has(i) ? cyan("◉") : "◯"} ${labelOf(o)}`),
      warning || dim("  Space to tick · Enter when done"),
    ],
    onKey: (str, key) => {
      warning = "";
      if (key.name === "up" || key.name === "k") at = (at - 1 + options.length) % options.length;
      else if (key.name === "down" || key.name === "j" || key.name === "tab") at = (at + 1) % options.length;
      else if (key.name === "space") on.has(at) ? on.delete(at) : on.add(at);
      else if (/^[1-9]$/.test(str ?? "") && Number(str) <= options.length) { const i = Number(str) - 1; on.has(i) ? on.delete(i) : on.add(i); at = i; }
      else if (key.name === "return" || key.name === "enter") {
        if (on.size < min) { warning = `  Choose at least ${min}.`; return null; }
        const picked = [...on].sort((a, b) => a - b);
        return { done: picked, summary: `${cyan("✔")} ${question} ${dim("·")} ${picked.map((i) => nameOf(options[i])).join(", ")}\n` };
      }
      return null;
    },
  });
}

/** Ask for free text, with a default used when the answer is empty. */
export async function text({ question, fallback, input = process.stdin, output = process.stdout }) {
  const rl = createInterface({ input, output, terminal: Boolean(input.isTTY) });
  try {
    // The default is typed in for you: Enter keeps it, Backspace edits it.
    const pending = rl.question(`${cyan("?")} ${bold(question)} `);
    if (fallback) rl.write(fallback);
    const answer = (await pending).trim() || fallback;
    // Collapse the answered line like the pickers do: "✔ Folder in this repo: · business_logic".
    if (input.isTTY) output.write(`\x1b[1A\r\x1b[J${cyan("✔")} ${question.replace(/:$/, "")} ${dim("·")} ${answer}\n`);
    return answer;
  } finally {
    rl.close();
  }
}

/**
 * The pickers the CLI uses. When `interactive` is false every question returns its default,
 * so `--yes` and piped input never block.
 */
export function pickers({ interactive, input = process.stdin, output = process.stdout }) {
  const recommendedIndex = (options) => Math.max(0, options.findIndex((o) => o.recommended));
  return {
    interactive,
    async one(question, options, defaultIndex = recommendedIndex(options)) {
      if (!interactive) return options[defaultIndex].value;
      return options[await select({ question, options, defaultIndex, input, output })].value;
    },
    async many(question, options, checked) {
      if (!interactive) return (checked ?? options.map((_, i) => i)).map((i) => options[i].value);
      return (await multiSelect({ question, options, checked, input, output })).map((i) => options[i].value);
    },
    async text(question, fallback) {
      if (!interactive) return fallback;
      return text({ question, fallback, input, output });
    },
  };
}
