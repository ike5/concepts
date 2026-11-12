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

const labelOf = (o) => `${o.label}${o.recommended ? dim(" (recommended)") : ""}`;
const visible = (s) => s.replace(/\x1b\[[0-9;]*m/g, "").length;

/** One option row, with its description cut to fit the terminal so a row never wraps (wrapping breaks redraws). */
function row(output, head, description) {
  const room = (output.columns || 100) - visible(head) - 3;
  if (!description || room < 12) return head;
  return `${head}${dim(`  ${description.length > room ? `${description.slice(0, room - 1)}…` : description}`)}`;
}

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
      ...options.map((o, i) => row(output, `${i === at ? cyan("❯") : " "} ${i + 1}. ${i === at ? cyan(labelOf(o)) : labelOf(o)}`, o.description)),
      dim("  ↑/↓ to move · Enter to choose"),
    ],
    onKey: (str, key) => {
      if (key.name === "up" || key.name === "k") at = (at - 1 + options.length) % options.length;
      else if (key.name === "down" || key.name === "j" || key.name === "tab") at = (at + 1) % options.length;
      else if (/^[1-9]$/.test(str ?? "") && Number(str) <= options.length) at = Number(str) - 1;
      else if (key.name === "return" || key.name === "enter") return { done: at, summary: `${cyan("✔")} ${question} ${dim("·")} ${options[at].label}\n` };
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
      ...options.map((o, i) => row(output, `${i === at ? cyan("❯") : " "} ${on.has(i) ? cyan("◉") : "◯"} ${labelOf(o)}`, o.description)),
      warning || dim("  ↑/↓ to move · Space to toggle · Enter to confirm"),
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
        return { done: picked, summary: `${cyan("✔")} ${question} ${dim("·")} ${picked.map((i) => options[i].label).join(", ")}\n` };
      }
      return null;
    },
  });
}

/** Ask for free text, with a default used when the answer is empty. */
export async function text({ question, fallback, input = process.stdin, output = process.stdout }) {
  const rl = createInterface({ input, output, terminal: Boolean(input.isTTY) });
  try {
    const answer = (await rl.question(`${cyan("?")} ${bold(question)}${fallback ? dim(` (${fallback})`) : ""} `)).trim();
    return answer || fallback;
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
