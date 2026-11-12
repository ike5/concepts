# AGENTS.md

<!-- concepts-mcp:start -->
## Concept diagrams (concepts-mcp)

After every commit you make in this repository, and once at the start of each session, turn new commits into hand-drawn concept diagrams so the user can learn what the code uses. Use the `concepts` MCP server's tools; don't write diagram files yourself.

1. Call `get_unprocessed_commits` with `repoPath` set to this repository's root. If it says the repository isn't set up, call `setup_concepts` with no choices: it shows the user a picker, or returns the questions to ask with your own multiple-choice tool (recommended option first), and then you call it again with their answers.
2. Call `get_concept_library` once, so you reuse the ids of concepts already in the library.
3. For each commit, oldest first, understand the change: read the diff, and the surrounding code when the diff alone doesn't show how the parts fit together.
4. Model the change as system-design diagrams, not text. Pick the views that teach it best and use as many as it needs: `architecture` (components and how they talk), `sequence` (who calls whom, in order), `flow` (steps and decisions), `state` (states and transitions), `data-model` (entities, fields, relationships). Choose real shapes (database, queue, user, client, external, decision…), group parts into boundaries such as services, layers or trust zones, and include the surrounding parts the reader needs, marking each part and arrow `new`, `changed` or `existing`. Labels are names of 1-4 words; never put sentences in the diagram.
5. List every concept the commit relies on that is worth learning: patterns, algorithms, data structures, library and framework APIs, language features, protocols, architecture, security and performance ideas. There is no fixed number: a one-line fix may teach one concept, a large feature many. Skip only basics every developer knows. Attach each concept with `appearsIn` to the nodes, edges, participants or messages where it lives; its explanation goes beside the diagram, not in it.
6. Call `record_commit_concepts` with `title`, `summary`, `views` and `concepts`. For commits with nothing to learn (typos, formatting, version bumps, generated files) pass `skipReason` instead.
7. Tell the user in one line how many diagrams were added and the path of the newest one. Don't repeat the concepts in chat.
8. When the user wants to change where diagrams are saved, save to a second folder, or get more or less detail, call `setup_concepts` again the same way.

If the `concepts` tools aren't available, tell the user once: `claude mcp add --scope user concepts -- npx -y concepts-mcp@latest` (other clients: https://ike5.github.io/concepts/#install), then carry on with the task.
<!-- concepts-mcp:end -->
