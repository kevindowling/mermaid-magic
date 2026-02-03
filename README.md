# Mermaid Magic (VS Code Extension)

Visual flowchart and sequence editor with Mermaid and Lucid CSV export.

## Quick Start

1. Run `npm install`
2. Run `npm run compile`
3. Press `F5` in VS Code to launch an Extension Development Host.
4. Use the Mermaid Magic icon in the Activity Bar to open the sidebar controls (open or create editor windows), or run the command palette:
   - `Mermaid Magic: Open Editor`
   - `Mermaid Magic: Export Mermaid`
   - `Mermaid Magic: Export Lucid CSV`
   - `Mermaid Magic: Import Mermaid From Active Editor`

## How It Works

- The editor stores your diagram in `mermaid-magic.json` at the workspace root.
- The webview lets you create/edit flowcharts (nodes/edges) and sequences (participants/messages).
- Use mouse wheel to zoom and drag the canvas background to pan.
- Mermaid text is generated automatically; use the hamburger menu to open/close the Mermaid text drawer. You can edit the text there and click **Apply Text**, or open a text editor via `Mermaid Magic: Open Mermaid Text`.
- If you edit the Mermaid text opened by Mermaid Magic and save it, the diagram is imported back automatically (it includes a `%% mermaid-magic` marker).
- Lucid CSV export targets the flowchart model.
- Right click a `.mmd` or `.mermaid` file in the explorer and choose `Mermaid Magic: Open Mermaid File In Editor` to import it into the visual editor.

## Files

- `src/extension.ts` — VS Code extension commands + export logic.
- `media/editor.js` — Webview editor logic (canvas + inspector).
- `media/editor.css` — Webview styles.
