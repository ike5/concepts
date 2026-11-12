<p align="center">
  <img src="docs/assets/banner.svg" alt="Concepts — Learn from the code your AI just wrote." width="100%">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/concepts-mcp"><img alt="npm" src="https://img.shields.io/npm/v/concepts-mcp?color=4b3fc4"></a>
  <a href="https://github.com/ike5/concepts/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/ike5/concepts/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE.md"><img alt="License: PolyForm Noncommercial 1.0.0" src="https://img.shields.io/badge/license-PolyForm%20NC%201.0-4b3fc4"></a>
  <img alt="Node.js 20+" src="https://img.shields.io/badge/node-%E2%89%A520-17181f">
</p>

<p align="center">
  <a href="https://ike5.github.io/concepts/"><b>Website</b></a> ·
  <a href="https://ike5.github.io/concepts/#install"><b>Install</b></a> ·
  <a href="https://ike5.github.io/concepts/library.html"><b>Example library</b></a> ·
  <a href="CONTRIBUTING.md"><b>Contribute</b></a>
</p>

**Learn from the code your AI just wrote.** Concepts is an MCP server. After every commit, your coding agent draws the change as hand-drawn system-design diagrams and marks each concept it relies on (patterns, algorithms, protocols, library APIs, security decisions) right where it lives. Every concept also gets a note in a library that grows as you code.

Your agent does the thinking, so there's no extra API key or account. Everything runs on your machine.

<p align="center"><img src="docs/assets/example.svg" alt="Example concept diagram: Retrying failed webhooks, with an architecture view and a sequence view and six numbered concept markers" width="100%"></p>

## Quick start

**1. Add the MCP.** It needs Node.js 20+ and git:

```sh
claude mcp add --scope user concepts -- npx -y concepts-mcp@latest
```

For Codex: `codex mcp add concepts -- npx -y concepts-mcp@latest`. For Cursor, VS Code or any other client, add a stdio server with command `npx` and args `-y concepts-mcp@latest` ([per-client commands](https://ike5.github.io/concepts/#install)). On native Windows, use `cmd /c npx …`.

**2. Turn it on in a repository.** Ask your agent:

```text
Set up concept diagrams for this repo.
```

Or run `npx -y concepts-mcp@latest init` in the repository folder. From then on, the agent diagrams each commit it makes, and commits you make by hand are picked up the next time it runs.

## How it works

| | |
| --- | --- |
| **1. You or your agent commit** | Concepts tracks which commits already have a diagram, and skips lockfiles, generated files and trivial commits. |
| **2. Your agent models the change** | It reads the diff and picks the views that teach it: architecture, sequence, flow, state or data model. |
| **3. The server draws it** | An SVG that renders on GitHub, and if you want more, an editable `.excalidraw` file and a README explaining each numbered concept. |

Diagrams go **in the project** (`docs/concepts/`, visible on GitHub), **in your learning library** (`~/Desktop/ConceptLibrary/<repo>/`), or both. Setup asks with simple pickers, and each folder gets its own level: **Diagram** (just the SVG, recommended), **Editable** (+ `.excalidraw`), **Diagram + notes** (+ README and concept notes) or **Custom**. Change it any time with `npx -y concepts-mcp@latest settings`, for everyone or just for you. Every diagram is numbered by its place in git history, so same-day commits stay in order. See [this repo's own library](docs/concepts/README.md): every commit to Concepts is diagrammed by Concepts.

## What your agent gets

| Tool | What it does |
| --- | --- |
| `get_concepts_instructions` | The workflow, so every commit is modeled the same way |
| `setup_concepts` | Sets up or changes where diagrams go and how much each commit saves, with a picker |
| `get_unprocessed_commits` | Commits without a diagram yet, with diffs sized to fit |
| `get_concept_library` | Concepts already learned, so their notes are reused |
| `record_commit_concepts` | Lays out and draws the diagrams, then updates the library |

Package docs and every setup option: [packages/concepts-mcp](packages/concepts-mcp/README.md).

## Repository layout

| Path | What it is |
| --- | --- |
| [`packages/concepts-mcp`](packages/concepts-mcp) | The npm package: MCP server and `init` CLI |
| [`docs/`](docs) | The website, served by GitHub Pages |
| [`docs/concepts/`](docs/concepts) | This repository's own concept library |
| [`.github/`](.github) | CI on Linux, macOS and Windows; npm publishing on `v*` tags; issue templates |

## Develop

```sh
cd packages/concepts-mcp
npm install
npm test
npm run example     # draws examples/commit.json into examples/output/
```

To release, bump `version` in `packages/concepts-mcp/package.json` and `server.json`, then push a `v<version>` tag.

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first, and please follow the [Code of Conduct](.github/CODE_OF_CONDUCT.md). To report a vulnerability privately, see [SECURITY.md](.github/SECURITY.md).

## License

[PolyForm Noncommercial 1.0.0](LICENSE.md): free to use, clone and modify for any noncommercial purpose; no selling or commercial use. The diagram font is licensed separately ([font license](packages/concepts-mcp/fonts/LICENSE-FONT.md)), and the website fonts are under the SIL Open Font License ([docs/assets/fonts](docs/assets/fonts)).
