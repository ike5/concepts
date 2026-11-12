// Adds diagrams recorded after this page was last edited, read from the library's own state.json,
// so new commits show up here without hand-editing the page.
(function () {
  var grid = document.getElementById("diagrams");
  var stat = document.getElementById("stat-diagrams");
  if (!grid || !window.fetch) return;
  var repo = "https://github.com/ike5/concepts/tree/main/docs/concepts/";

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  fetch("concepts/state.json").then(function (r) { return r.ok ? r.json() : null; }).then(function (state) {
    if (!state || !state.commits) return;
    var shown = {};
    grid.querySelectorAll("[data-sha]").forEach(function (a) { shown[a.dataset.sha] = true; });
    var all = Object.keys(state.commits).map(function (k) { return state.commits[k]; }).filter(function (c) { return c.folder && !c.elsewhere; });
    // Newest first, by place in history when known: dates alone can't order commits from the same day.
    var fresh = all.filter(function (c) { return !shown[c.shortSha]; })
      .sort(function (a, b) { return a.seq && b.seq ? b.seq - a.seq : a.date < b.date ? 1 : -1; });
    if (stat) stat.textContent = String(all.length);
    fresh.reverse().forEach(function (c) {
      var card = el("article", "diagram");
      card.dataset.sha = c.shortSha;
      var thumb = el("div", "thumb");
      var img = el("img");
      img.src = "concepts/" + c.folder + "/concepts.svg";
      img.alt = "Concept diagram: " + c.title;
      img.loading = "lazy";
      thumb.appendChild(img);
      var body = el("div", "body");
      var meta = el("div", "meta");
      if (c.seq) meta.appendChild(el("span", "", "#" + c.seq));
      meta.appendChild(el("code", "", c.shortSha));
      meta.appendChild(el("span", "", new Date(c.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })));
      var h = el("h2");
      var a = el("a", "", c.title);
      a.href = repo + c.folder;
      h.appendChild(a);
      body.appendChild(meta);
      body.appendChild(h);
      body.appendChild(el("p", "", c.subject));
      body.appendChild(el("p", "concepts", (c.concepts || []).length + " concepts"));
      card.appendChild(thumb);
      card.appendChild(body);
      grid.insertBefore(card, grid.firstChild);
    });
  }).catch(function () {});
})();
