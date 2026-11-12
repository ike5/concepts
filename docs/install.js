(function () {
  var NAME = "concepts";
  var CONFIG = { command: "npx", args: ["-y", "concepts-mcp@latest"] };
  var LAUNCH = CONFIG.command + " " + CONFIG.args.join(" ");
  var needs = "Needs Node.js 20+ and git. ";
  var defs = {
    claude: {
      install: "claude mcp add --scope user " + NAME + " -- " + LAUNCH,
      uninstall: "claude mcp remove --scope user " + NAME,
      hint: needs + "Paste into your terminal. On native Windows use “cmd /c " + LAUNCH + "”."
    },
    codex: {
      install: "codex mcp add " + NAME + " -- " + LAUNCH,
      uninstall: "codex mcp remove " + NAME,
      hint: needs + "Paste into your terminal."
    },
    cursor: {
      install: "cursor://anysphere.cursor-deeplink/mcp/install?name=" + NAME + "&config=" + encodeURIComponent(btoa(JSON.stringify(CONFIG))),
      uninstall: "Open Cursor settings → MCP, and remove \"" + NAME + "\".\nOr delete its entry from ~/.cursor/mcp.json.",
      hint: needs + "Click “Open in Cursor”, or copy the link and open it."
    },
    vscode: {
      install: "code --add-mcp '" + JSON.stringify({ name: NAME, command: CONFIG.command, args: CONFIG.args }) + "'",
      uninstall: "# In VS Code, run \"MCP: Open User Configuration\"\n# and delete the \"" + NAME + "\" entry",
      hint: needs + "Paste into your terminal."
    },
    other: {
      install: JSON.stringify({ mcpServers: { concepts: CONFIG } }, null, 2),
      uninstall: "Remove the \"" + NAME + "\" server from your client's MCP settings.",
      hint: needs + "Add this stdio server to your client's MCP config, next to your other servers."
    }
  };
  var state = { mode: "install", client: "claude" };
  var code = document.getElementById("command");
  var note = document.getElementById("command-note");
  var open = document.getElementById("open-link");

  function render() {
    var d = defs[state.client];
    code.textContent = d[state.mode];
    note.textContent = state.mode === "install" ? d.hint : "Your diagrams stay where they are until you delete them.";
    var cursor = state.client === "cursor" && state.mode === "install";
    open.hidden = !cursor;
    if (cursor) open.href = d.install;
    document.querySelectorAll("[data-client]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.client === state.client)); });
    document.querySelectorAll("[data-mode]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.mode === state.mode)); });
  }

  document.querySelectorAll("[data-client]").forEach(function (b) { b.addEventListener("click", function () { state.client = b.dataset.client; render(); }); });
  document.querySelectorAll("[data-mode]").forEach(function (b) { b.addEventListener("click", function () { state.mode = b.dataset.mode; render(); }); });

  // Every copy button copies the text of the element named in data-copy.
  document.querySelectorAll("[data-copy]").forEach(function (button) {
    button.addEventListener("click", function () {
      var text = document.getElementById(button.dataset.copy).textContent;
      var done = function (ok) {
        button.textContent = ok ? "Copied" : "Select and copy";
        setTimeout(function () { button.textContent = "Copy"; }, 1600);
      };
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
      else done(false);
    });
  });
  render();
})();
