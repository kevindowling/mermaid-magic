"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const DATA_FILE = "mermaid-magic.json";
const DEFAULT_NODE = {
    width: 160,
    height: 64,
    shape: "process",
    fill: "#F2F2F2",
    stroke: "#333333",
    textColor: "#111111"
};
const DEFAULT_EDGE = {
    label: "",
    stroke: "#444444",
    arrow: "arrow"
};
const DEFAULT_MESSAGE = {
    label: "",
    line: "solid"
};
const DEFAULT_PIE_SLICE = {
    label: "Slice",
    value: 20,
    color: "#60a5fa"
};
const DEFAULT_GANTT_TASK = {
    section: "Phase",
    label: "Task",
    start: "2024-01-01",
    end: "2024-01-05",
    status: ""
};
const DEFAULT_JOURNEY_STEP = {
    section: "Stage",
    task: "Step",
    score: 3,
    personas: ["User"]
};
function activate(context) {
    const panelState = {
        panels: []
    };
    const activeWebviews = new Set();
    let diagramState = null;
    let panelCounter = 1;
    let sidebarWebview = null;
    let activeMermaidFile = null;
    const resolveRoot = () => {
        const root = getWorkspaceRoot();
        if (!root) {
            vscode.window.showErrorMessage("Open a workspace folder to use Mermaid Magic.");
            return null;
        }
        return root;
    };
    const getDiagram = (root) => {
        if (!diagramState) {
            diagramState = loadDiagram(root);
        }
        return diagramState;
    };
    const postDiagramToWebview = (webview, diagram) => {
        try {
            webview.postMessage({
                type: "loadDiagram",
                diagram,
                mermaid: diagramToMermaid(diagram)
            });
            return true;
        }
        catch {
            return false;
        }
    };
    const broadcastDiagram = (diagram) => {
        for (const webview of Array.from(activeWebviews)) {
            const ok = postDiagramToWebview(webview, diagram);
            if (!ok) {
                activeWebviews.delete(webview);
            }
        }
    };
    const toWorkspacePath = (root, uri) => path.relative(root, uri.fsPath).replace(/\\/g, "/");
    const updateSidebarFiles = async (root) => {
        if (!sidebarWebview)
            return;
        try {
            const files = await vscode.workspace.findFiles("**/*.{mmd,mermaid}", "**/node_modules/**");
            sidebarWebview.postMessage({
                type: "files",
                files: files.map((file) => ({ path: toWorkspacePath(root, file) })),
                active: activeMermaidFile ? toWorkspacePath(root, activeMermaidFile) : null
            });
        }
        catch {
            sidebarWebview = null;
        }
    };
    const openMermaidUri = async (root, targetUri) => {
        const bytes = await vscode.workspace.fs.readFile(targetUri);
        const content = Buffer.from(bytes).toString("utf8");
        const current = getDiagram(root);
        const updated = parseMermaidToDiagram(content, current);
        if (!updated) {
            vscode.window.showErrorMessage("Unable to parse Mermaid content.");
            return;
        }
        saveDiagram(root, updated);
        diagramState = updated;
        activeMermaidFile = targetUri;
        openEditorPanel(root);
        broadcastDiagram(updated);
        updateSidebarFiles(root);
    };
    const exportLucid = async (root) => {
        const diagram = getDiagram(root);
        const defaultUri = vscode.Uri.file(path.join(root, "diagram.csv"));
        const target = await vscode.window.showSaveDialog({
            defaultUri,
            filters: { CSV: ["csv"], "All Files": ["*"] }
        });
        if (!target)
            return;
        const content = diagramToLucidCsv(diagram);
        if (!content) {
            vscode.window.showWarningMessage(`Lucid CSV export is not available for ${diagram.type} diagrams.`);
            return;
        }
        await vscode.workspace.fs.writeFile(target, Buffer.from(content, "utf8"));
        vscode.window.showInformationMessage(`Lucid CSV exported to ${target.fsPath}`);
    };
    const initializeWebview = (webview, root) => {
        webview.options = {
            enableScripts: true,
            localResourceRoots: [context.extensionUri]
        };
        webview.html = getWebviewContent(webview, context.extensionUri);
        activeWebviews.add(webview);
        webview.onDidReceiveMessage(async (message) => {
            switch (message.type) {
                case "ready": {
                    const diagram = getDiagram(root);
                    postDiagramToWebview(webview, diagram);
                    break;
                }
                case "updateDiagram": {
                    const diagram = normalizeDiagram(message.diagram);
                    diagramState = diagram;
                    saveDiagram(root, diagram);
                    broadcastDiagram(diagram);
                    break;
                }
                case "copyMermaid": {
                    const diagram = getDiagram(root);
                    await vscode.env.clipboard.writeText(diagramToMermaid(diagram));
                    vscode.window.showInformationMessage("Mermaid copied to clipboard.");
                    break;
                }
                case "openText": {
                    const diagram = getDiagram(root);
                    await openMermaidText(diagram);
                    break;
                }
                case "exportLucid": {
                    await exportLucid(root);
                    break;
                }
                case "importMermaidText": {
                    const content = typeof message.content === "string" ? message.content : "";
                    const current = getDiagram(root);
                    const updated = parseMermaidToDiagram(content, current);
                    if (!updated) {
                        vscode.window.showErrorMessage("Unable to parse Mermaid text.");
                        break;
                    }
                    saveDiagram(root, updated);
                    diagramState = updated;
                    broadcastDiagram(updated);
                    vscode.window.showInformationMessage("Mermaid text applied.");
                    break;
                }
            }
        });
    };
    const openEditorPanel = (root, options) => {
        const reuse = options?.reuse !== false;
        if (reuse && panelState.panels.length) {
            while (panelState.panels.length) {
                const existing = panelState.panels[panelState.panels.length - 1];
                try {
                    existing.panel.reveal();
                    return existing.panel;
                }
                catch {
                    panelState.panels.pop();
                }
            }
        }
        const panelId = panelCounter++;
        const panel = vscode.window.createWebviewPanel("mermaidMagic.editor", `Mermaid Magic #${panelId}`, vscode.ViewColumn.One, {
            enableScripts: true,
            retainContextWhenHidden: true
        });
        panelState.panels.push({ id: panelId, panel });
        initializeWebview(panel.webview, root);
        panel.onDidDispose(() => {
            activeWebviews.delete(panel.webview);
            panelState.panels = panelState.panels.filter((item) => item.panel !== panel);
        });
        return panel;
    };
    context.subscriptions.push(vscode.commands.registerCommand("mermaidMagic.openEditor", async () => {
        const root = resolveRoot();
        if (!root)
            return;
        openEditorPanel(root);
    }));
    context.subscriptions.push(vscode.commands.registerCommand("mermaidMagic.openText", async () => {
        const root = resolveRoot();
        if (!root)
            return;
        const diagram = getDiagram(root);
        await openMermaidText(diagram);
    }));
    context.subscriptions.push(vscode.commands.registerCommand("mermaidMagic.importMermaid", async () => {
        const root = resolveRoot();
        if (!root)
            return;
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage("Open a Mermaid file to import.");
            return;
        }
        if (editor.document.languageId !== "mermaid") {
            vscode.window.showErrorMessage("Active editor is not a Mermaid document.");
            return;
        }
        const content = editor.document.getText();
        const current = getDiagram(root);
        const updated = parseMermaidToDiagram(content, current);
        if (!updated) {
            vscode.window.showErrorMessage("Unable to parse Mermaid content.");
            return;
        }
        saveDiagram(root, updated);
        diagramState = updated;
        broadcastDiagram(updated);
        vscode.window.showInformationMessage("Mermaid imported into Mermaid Magic.");
    }));
    context.subscriptions.push(vscode.commands.registerCommand("mermaidMagic.openMermaidFile", async (uri) => {
        const root = resolveRoot();
        if (!root)
            return;
        const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;
        if (!targetUri) {
            vscode.window.showErrorMessage("Select a Mermaid file to open.");
            return;
        }
        await openMermaidUri(root, targetUri);
    }));
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((document) => {
        if (document.languageId !== "mermaid")
            return;
        const content = document.getText();
        if (!hasMagicMarker(content))
            return;
        const root = getWorkspaceRoot();
        if (!root)
            return;
        const current = getDiagram(root);
        const updated = parseMermaidToDiagram(content, current);
        if (!updated)
            return;
        saveDiagram(root, updated);
        diagramState = updated;
        broadcastDiagram(updated);
        vscode.window.showInformationMessage("Mermaid imported from saved text.");
    }));
    context.subscriptions.push(vscode.commands.registerCommand("mermaidMagic.exportMermaid", async () => {
        const root = resolveRoot();
        if (!root)
            return;
        const diagram = getDiagram(root);
        const defaultUri = vscode.Uri.file(path.join(root, "diagram.mmd"));
        const target = await vscode.window.showSaveDialog({
            defaultUri,
            filters: { Mermaid: ["mmd", "mermaid"], "All Files": ["*"] }
        });
        if (!target)
            return;
        const content = diagramToMermaid(diagram);
        await vscode.workspace.fs.writeFile(target, Buffer.from(content, "utf8"));
        vscode.window.showInformationMessage(`Mermaid exported to ${target.fsPath}`);
    }));
    context.subscriptions.push(vscode.commands.registerCommand("mermaidMagic.exportLucidCsv", async () => {
        const root = resolveRoot();
        if (!root)
            return;
        await exportLucid(root);
    }));
    context.subscriptions.push(vscode.window.registerWebviewViewProvider("mermaidMagic.sidebar", {
        resolveWebviewView: (view) => {
            const root = resolveRoot();
            if (!root) {
                view.webview.html = getNoWorkspaceHtml();
                return;
            }
            view.webview.options = {
                enableScripts: true
            };
            sidebarWebview = view.webview;
            view.webview.html = getSidebarHtml(view.webview);
            updateSidebarFiles(root);
            const watcher = vscode.workspace.createFileSystemWatcher("**/*.{mmd,mermaid}");
            watcher.onDidCreate(() => updateSidebarFiles(root));
            watcher.onDidDelete(() => updateSidebarFiles(root));
            watcher.onDidChange(() => updateSidebarFiles(root));
            context.subscriptions.push(watcher);
            view.webview.onDidReceiveMessage((message) => {
                if (!root)
                    return;
                switch (message.type) {
                    case "ready": {
                        updateSidebarFiles(root);
                        break;
                    }
                    case "openEditor": {
                        openEditorPanel(root, { reuse: true });
                        break;
                    }
                    case "closeEditor": {
                        const target = panelState.panels[panelState.panels.length - 1];
                        target?.panel.dispose();
                        panelState.panels = panelState.panels.filter((item) => item !== target);
                        break;
                    }
                    case "refreshFiles": {
                        updateSidebarFiles(root);
                        break;
                    }
                    case "openFile": {
                        if (!message.path)
                            break;
                        const targetPath = path.join(root, message.path);
                        openMermaidUri(root, vscode.Uri.file(targetPath));
                        break;
                    }
                }
            });
            view.onDidDispose(() => {
                if (sidebarWebview === view.webview) {
                    sidebarWebview = null;
                }
            });
        }
    }));
}
function deactivate() { }
function getWorkspaceRoot() {
    const folder = vscode.workspace.workspaceFolders?.[0];
    return folder?.uri.fsPath ?? null;
}
function dataFilePath(root) {
    return path.join(root, DATA_FILE);
}
function loadDiagram(root) {
    const filePath = dataFilePath(root);
    if (!fs.existsSync(filePath)) {
        const fresh = createDefaultDiagram();
        fs.writeFileSync(filePath, JSON.stringify(fresh, null, 2), "utf8");
        return fresh;
    }
    try {
        const raw = fs.readFileSync(filePath, "utf8");
        const parsed = JSON.parse(raw);
        return normalizeDiagram(parsed);
    }
    catch {
        const fallback = createDefaultDiagram();
        fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2), "utf8");
        return fallback;
    }
}
function saveDiagram(root, diagram) {
    const filePath = dataFilePath(root);
    fs.writeFileSync(filePath, JSON.stringify(diagram, null, 2), "utf8");
}
function createDefaultDiagram() {
    return {
        version: 2,
        type: "flowchart",
        nextId: 112,
        flowchart: {
            nodes: [
                {
                    id: 2,
                    label: "Start",
                    x: 180,
                    y: 140,
                    ...DEFAULT_NODE,
                    shape: "terminator"
                },
                {
                    id: 3,
                    label: "Process",
                    x: 420,
                    y: 140,
                    ...DEFAULT_NODE
                }
            ],
            edges: [
                {
                    id: 100,
                    from: 2,
                    to: 3,
                    ...DEFAULT_EDGE
                }
            ]
        },
        sequence: {
            participants: [
                { id: 4, name: "User" },
                { id: 5, name: "System" }
            ],
            messages: [
                {
                    id: 101,
                    from: 4,
                    to: 5,
                    ...DEFAULT_MESSAGE,
                    label: "Request"
                }
            ]
        },
        pie: {
            title: "Usage",
            slices: [
                { id: 102, ...DEFAULT_PIE_SLICE, label: "Alpha", value: 40, color: "#60a5fa" },
                { id: 103, ...DEFAULT_PIE_SLICE, label: "Beta", value: 60, color: "#34d399" }
            ]
        },
        gantt: {
            title: "Project Plan",
            dateFormat: "YYYY-MM-DD",
            tasks: [
                { id: 104, ...DEFAULT_GANTT_TASK, section: "Design", label: "Wireframes" },
                { id: 105, ...DEFAULT_GANTT_TASK, section: "Build", label: "Implementation", start: "2024-01-06", end: "2024-01-14", status: "active" }
            ]
        },
        journey: {
            title: "User Journey",
            steps: [
                { id: 106, ...DEFAULT_JOURNEY_STEP, section: "Discover", task: "Browse", score: 4, personas: ["User"] },
                { id: 107, ...DEFAULT_JOURNEY_STEP, section: "Purchase", task: "Checkout", score: 3, personas: ["User"] }
            ]
        }
    };
}
function normalizeDiagram(raw) {
    if (!raw || typeof raw !== "object") {
        return createDefaultDiagram();
    }
    const isLegacy = Array.isArray(raw?.nodes) || Array.isArray(raw?.edges);
    const flowchartNodes = isLegacy
        ? raw.nodes?.map(normalizeNode) ?? []
        : raw.flowchart?.nodes?.map(normalizeNode) ?? [];
    const flowchartEdges = isLegacy
        ? raw.edges?.map(normalizeEdge) ?? []
        : raw.flowchart?.edges?.map(normalizeEdge) ?? [];
    const sequenceParticipants = Array.isArray(raw?.sequence?.participants)
        ? raw.sequence.participants.map(normalizeParticipant)
        : [];
    const sequenceMessages = Array.isArray(raw?.sequence?.messages)
        ? raw.sequence.messages.map(normalizeMessage)
        : [];
    const pie = normalizePie(raw?.pie);
    const gantt = normalizeGantt(raw?.gantt);
    const journey = normalizeJourney(raw?.journey);
    const type = raw?.type === "sequence" ||
        raw?.type === "flowchart" ||
        raw?.type === "pie" ||
        raw?.type === "gantt" ||
        raw?.type === "journey"
        ? raw.type
        : "flowchart";
    const diagram = {
        version: 2,
        type,
        flowchart: {
            nodes: flowchartNodes,
            edges: flowchartEdges
        },
        sequence: {
            participants: sequenceParticipants,
            messages: sequenceMessages
        },
        pie,
        gantt,
        journey,
        nextId: Number(raw?.nextId) || 1
    };
    diagram.nextId = computeNextId(diagram, diagram.nextId);
    return diagram;
}
function normalizeNode(node) {
    return {
        id: Number(node?.id) || 0,
        label: String(node?.label ?? "Node"),
        x: Number(node?.x) || 0,
        y: Number(node?.y) || 0,
        width: Number(node?.width) || DEFAULT_NODE.width,
        height: Number(node?.height) || DEFAULT_NODE.height,
        shape: isNodeShape(node?.shape) ? node.shape : DEFAULT_NODE.shape,
        fill: String(node?.fill ?? DEFAULT_NODE.fill),
        stroke: String(node?.stroke ?? DEFAULT_NODE.stroke),
        textColor: String(node?.textColor ?? DEFAULT_NODE.textColor)
    };
}
function normalizeEdge(edge) {
    return {
        id: Number(edge?.id) || 0,
        from: Number(edge?.from) || 0,
        to: Number(edge?.to) || 0,
        label: typeof edge?.label === "string" ? edge.label : "",
        stroke: String(edge?.stroke ?? DEFAULT_EDGE.stroke),
        arrow: isFlowchartArrow(edge?.arrow) ? edge.arrow : DEFAULT_EDGE.arrow
    };
}
function normalizeParticipant(participant) {
    return {
        id: Number(participant?.id) || 0,
        name: String(participant?.name ?? "Participant")
    };
}
function normalizeMessage(message) {
    return {
        id: Number(message?.id) || 0,
        from: Number(message?.from) || 0,
        to: Number(message?.to) || 0,
        label: String(message?.label ?? ""),
        line: message?.line === "dashed" ? "dashed" : "solid"
    };
}
function normalizePie(raw) {
    const slices = Array.isArray(raw?.slices)
        ? raw.slices.map((slice) => ({
            id: Number(slice?.id) || 0,
            label: String(slice?.label ?? DEFAULT_PIE_SLICE.label),
            value: Number(slice?.value) || 0,
            color: String(slice?.color ?? DEFAULT_PIE_SLICE.color)
        }))
        : [];
    return {
        title: String(raw?.title ?? ""),
        slices
    };
}
function normalizeGantt(raw) {
    const tasks = Array.isArray(raw?.tasks)
        ? raw.tasks.map((task) => ({
            id: Number(task?.id) || 0,
            section: String(task?.section ?? DEFAULT_GANTT_TASK.section),
            label: String(task?.label ?? DEFAULT_GANTT_TASK.label),
            start: String(task?.start ?? DEFAULT_GANTT_TASK.start),
            end: String(task?.end ?? DEFAULT_GANTT_TASK.end),
            status: (() => {
                const rawStatus = String(task?.status ?? "").toLowerCase();
                return isGanttStatus(rawStatus) ? rawStatus : DEFAULT_GANTT_TASK.status;
            })()
        }))
        : [];
    return {
        title: String(raw?.title ?? ""),
        dateFormat: String(raw?.dateFormat ?? "YYYY-MM-DD"),
        tasks
    };
}
function normalizeJourney(raw) {
    const steps = Array.isArray(raw?.steps)
        ? raw.steps.map((step) => ({
            id: Number(step?.id) || 0,
            section: String(step?.section ?? DEFAULT_JOURNEY_STEP.section),
            task: String(step?.task ?? DEFAULT_JOURNEY_STEP.task),
            score: Number(step?.score) || DEFAULT_JOURNEY_STEP.score,
            personas: Array.isArray(step?.personas)
                ? step.personas.map((persona) => String(persona))
                : DEFAULT_JOURNEY_STEP.personas
        }))
        : [];
    return {
        title: String(raw?.title ?? ""),
        steps
    };
}
function isNodeShape(value) {
    return value === "process" || value === "decision" || value === "terminator";
}
function isGanttStatus(value) {
    return value === "done" || value === "active" || value === "crit" || value === "";
}
function isFlowchartArrow(value) {
    return (value === "arrow" ||
        value === "none" ||
        value === "dashed" ||
        value === "thick" ||
        value === "double");
}
function arrowToMermaid(arrow) {
    switch (arrow) {
        case "none":
            return "---";
        case "dashed":
            return "-.->";
        case "thick":
            return "==>";
        case "double":
            return "<-->";
        case "arrow":
        default:
            return "-->";
    }
}
function arrowFromMermaid(token) {
    switch (token) {
        case "---":
            return "none";
        case "-.->":
            return "dashed";
        case "==>":
            return "thick";
        case "<-->":
            return "double";
        case "-->":
        default:
            return "arrow";
    }
}
function diagramToMermaid(diagram) {
    switch (diagram.type) {
        case "sequence":
            return diagramToMermaidSequence(diagram.sequence);
        case "pie":
            return diagramToMermaidPie(diagram.pie);
        case "gantt":
            return diagramToMermaidGantt(diagram.gantt);
        case "journey":
            return diagramToMermaidJourney(diagram.journey);
        case "flowchart":
        default:
            return diagramToMermaidFlowchart(diagram.flowchart);
    }
}
function diagramToMermaidFlowchart(flowchart) {
    const lines = [];
    lines.push("flowchart TD");
    const idMap = new Map();
    for (const node of flowchart.nodes) {
        const mermaidId = `N${node.id}`;
        idMap.set(node.id, mermaidId);
        const label = escapeMermaidText(node.label);
        const nodeSyntax = nodeShapeSyntax(node.shape, label);
        lines.push(`  ${mermaidId}${nodeSyntax}`);
    }
    for (const edge of flowchart.edges) {
        const fromId = idMap.get(edge.from);
        const toId = idMap.get(edge.to);
        if (!fromId || !toId)
            continue;
        const label = edge.label ? escapeMermaidText(edge.label) : "";
        const arrow = arrowToMermaid(edge.arrow);
        if (label) {
            lines.push(`  ${fromId} ${arrow}|${label}| ${toId}`);
        }
        else {
            lines.push(`  ${fromId} ${arrow} ${toId}`);
        }
    }
    for (const node of flowchart.nodes) {
        const id = idMap.get(node.id);
        if (!id)
            continue;
        lines.push(`  style ${id} fill:${node.fill},stroke:${node.stroke},color:${node.textColor}`);
    }
    return lines.join("\n");
}
function diagramToMermaidSequence(sequence) {
    const lines = [];
    lines.push("sequenceDiagram");
    const aliasMap = new Map();
    for (const participant of sequence.participants) {
        const alias = `P${participant.id}`;
        aliasMap.set(participant.id, alias);
        const name = escapeMermaidText(participant.name);
        lines.push(`  participant ${alias} as "${name}"`);
    }
    for (const message of sequence.messages) {
        const fromAlias = aliasMap.get(message.from);
        const toAlias = aliasMap.get(message.to);
        if (!fromAlias || !toAlias)
            continue;
        const arrow = message.line === "dashed" ? "-->>" : "->>";
        const label = escapeMermaidText(message.label);
        if (label) {
            lines.push(`  ${fromAlias}${arrow}${toAlias}: ${label}`);
        }
        else {
            lines.push(`  ${fromAlias}${arrow}${toAlias}`);
        }
    }
    return lines.join("\n");
}
function diagramToMermaidPie(pie) {
    const lines = [];
    lines.push("pie");
    if (pie.title) {
        lines.push(`  title ${pie.title}`);
    }
    for (const slice of pie.slices) {
        const label = slice.label.replace(/"/g, '\\"');
        lines.push(`  "${label}": ${slice.value}`);
    }
    return lines.join("\n");
}
function diagramToMermaidGantt(gantt) {
    const lines = [];
    lines.push("gantt");
    if (gantt.title) {
        lines.push(`  title ${gantt.title}`);
    }
    if (gantt.dateFormat) {
        lines.push(`  dateFormat ${gantt.dateFormat}`);
    }
    let currentSection = "";
    for (const task of gantt.tasks) {
        const section = task.section || "General";
        if (section !== currentSection) {
            currentSection = section;
            lines.push(`  section ${section}`);
        }
        const status = task.status ? `${task.status}, ` : "";
        lines.push(`  ${task.label} : ${status}${task.start}, ${task.end}`);
    }
    return lines.join("\n");
}
function diagramToMermaidJourney(journey) {
    const lines = [];
    lines.push("journey");
    if (journey.title) {
        lines.push(`  title ${journey.title}`);
    }
    let currentSection = "";
    for (const step of journey.steps) {
        const section = step.section || "Journey";
        if (section !== currentSection) {
            currentSection = section;
            lines.push(`  section ${section}`);
        }
        const personas = step.personas.length ? step.personas.join(", ") : "";
        lines.push(`  ${step.task}: ${step.score}: ${personas}`);
    }
    return lines.join("\n");
}
function nodeShapeSyntax(shape, label) {
    switch (shape) {
        case "decision":
            return `{${label}}`;
        case "terminator":
            return `([${label}])`;
        case "process":
        default:
            return `["${label}"]`;
    }
}
function escapeMermaidText(text) {
    return text
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\|/g, "\\|")
        .replace(/\r?\n/g, "\\n");
}
function unescapeMermaidText(text) {
    return text
        .replace(/\\n/g, "\n")
        .replace(/\\\|/g, "|")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
}
const LUCID_HEADERS = {
    flowchart: [
        "Id",
        "Name",
        "Shape Library",
        "Page ID",
        "Contained By",
        "Line Source",
        "Line Destination",
        "Source Arrow",
        "Destination Arrow",
        "Text Area 1",
        "Text Area 2",
        "Text Area 3"
    ],
    sequence: [
        "Id",
        "Name",
        "Shape Library",
        "Page ID",
        "Contained By",
        "Group",
        "Line Source",
        "Line Destination",
        "Source Arrow",
        "Destination Arrow",
        "Status",
        "Text Area 1",
        "Text Area 2",
        "Comments"
    ],
    pie: [
        "Id",
        "Name",
        "Shape Library",
        "Page ID",
        "Contained By",
        "Group",
        "Status",
        "Text Area 1",
        "Text Area 2",
        "Text Area 3",
        "Text Area 4",
        "Comments",
        "background",
        "foreground",
        "max",
        "min",
        "thickness",
        "value"
    ],
    gantt: [
        "Id",
        "Name",
        "Shape Library",
        "Page ID",
        "Contained By",
        "Group",
        "Visualization",
        "Status",
        "Text Area 1",
        "Text Area 2",
        "Text Area 3",
        "Text Area 4",
        "Text Area 5",
        "Text Area 6",
        "Text Area 7",
        "Comments",
        "Assignee",
        "Description",
        "displaydue",
        "End Date",
        "Estimate",
        "Name",
        "Start Date",
        "Status",
        "T-shirt size",
        "Title",
        "value"
    ],
    journey: [
        "Id",
        "Name",
        "Shape Library",
        "Page ID",
        "Contained By",
        "Group",
        "Line Source",
        "Line Destination",
        "Source Arrow",
        "Destination Arrow",
        "Status",
        "Text Area 1",
        "Text Area 2",
        "Text Area 3",
        "Text Area 4",
        "Text Area 5",
        "Text Area 6",
        "Comments"
    ]
};
function diagramToLucidCsv(diagram) {
    switch (diagram.type) {
        case "flowchart":
            return diagramToLucidCsvFlowchart(diagram.flowchart);
        case "sequence":
            return diagramToLucidCsvSequence(diagram.sequence);
        case "pie":
            return diagramToLucidCsvPie(diagram.pie);
        case "gantt":
            return diagramToLucidCsvGantt(diagram.gantt);
        case "journey":
            return diagramToLucidCsvJourney(diagram.journey);
        default:
            return null;
    }
}
function diagramToLucidCsvFlowchart(flowchart) {
    const headers = LUCID_HEADERS.flowchart;
    const rows = [];
    rows.push(headers);
    rows.push(buildLucidRow(headers, {
        Id: "1",
        Name: "Page",
        "Text Area 1": "Page 1"
    }));
    const nodeName = (shape) => {
        switch (shape) {
            case "decision":
                return "Decision";
            case "terminator":
                return "Terminator";
            case "process":
            default:
                return "Process";
        }
    };
    for (const node of flowchart.nodes) {
        rows.push(buildLucidRow(headers, {
            Id: String(node.id),
            Name: nodeName(node.shape),
            "Shape Library": "Flowchart Shapes",
            "Page ID": "1",
            "Text Area 1": node.label
        }));
    }
    for (const edge of flowchart.edges) {
        const sourceArrow = edge.arrow === "double" ? "Arrow" : "None";
        const destinationArrow = edge.arrow === "none" ? "None" : "Arrow";
        rows.push(buildLucidRow(headers, {
            Id: String(edge.id),
            Name: "Line",
            "Page ID": "1",
            "Line Source": String(edge.from),
            "Line Destination": String(edge.to),
            "Source Arrow": sourceArrow,
            "Destination Arrow": destinationArrow,
            "Text Area 1": edge.label ?? ""
        }));
    }
    return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}
function diagramToLucidCsvSequence(sequence) {
    const headers = LUCID_HEADERS.sequence;
    const rows = [];
    rows.push(headers);
    rows.push(buildLucidRow(headers, {
        Id: "1",
        Name: "Document",
        Status: "Draft",
        "Text Area 1": "Sequence diagram"
    }));
    rows.push(buildLucidRow(headers, {
        Id: "2",
        Name: "Page",
        "Text Area 1": "Page 1"
    }));
    let nextId = 3;
    const participantIds = new Map();
    for (const participant of sequence.participants) {
        const id = nextId++;
        participantIds.set(participant.id, id);
        rows.push(buildLucidRow(headers, {
            Id: String(id),
            Name: "Class",
            "Shape Library": "UML",
            "Page ID": "2",
            "Text Area 1": participant.name
        }));
    }
    for (const message of sequence.messages) {
        const from = participantIds.get(message.from);
        const to = participantIds.get(message.to);
        if (!from || !to)
            continue;
        rows.push(buildLucidRow(headers, {
            Id: String(nextId++),
            Name: "Line",
            "Page ID": "2",
            "Line Source": String(from),
            "Line Destination": String(to),
            "Source Arrow": "None",
            "Destination Arrow": "Arrow",
            "Text Area 1": message.label ?? ""
        }));
    }
    return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}
function diagramToLucidCsvPie(pie) {
    const headers = LUCID_HEADERS.pie;
    const rows = [];
    rows.push(headers);
    rows.push(buildLucidRow(headers, {
        Id: "1",
        Name: "Document",
        "Text Area 1": pie.title || "Pie chart"
    }));
    rows.push(buildLucidRow(headers, {
        Id: "2",
        Name: "Page",
        "Text Area 1": "Page 1"
    }));
    const total = pie.slices.reduce((sum, slice) => sum + slice.value, 0) || 1;
    let nextId = 3;
    for (const slice of pie.slices) {
        const value = Math.round((slice.value / total) * 100);
        rows.push(buildLucidRow(headers, {
            Id: String(nextId++),
            Name: "Progress Bar",
            "Shape Library": "Dynamic Shapes",
            "Page ID": "2",
            "Text Area 1": slice.label,
            background: "#00000000",
            foreground: slice.color || "#60a5fa",
            max: "100",
            min: "0",
            thickness: "100",
            value: String(value)
        }));
    }
    return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}
function diagramToLucidCsvGantt(gantt) {
    const headers = LUCID_HEADERS.gantt;
    const rows = [];
    rows.push(headers);
    rows.push(buildLucidRow(headers, {
        Id: "1",
        Name: "Document",
        "Text Area 1": gantt.title || "Gantt chart"
    }));
    rows.push(buildLucidRow(headers, {
        Id: "2",
        Name: "Page",
        "Text Area 1": "Page 1"
    }));
    let nextId = 3;
    for (const task of gantt.tasks) {
        const status = mapGanttStatus(task.status);
        const row = createLucidRow(headers);
        setLucidColumn(row, headers, "Id", String(nextId++));
        setLucidColumn(row, headers, "Name", "LucidCardBlock", 0);
        setLucidColumn(row, headers, "Page ID", "2");
        setLucidColumn(row, headers, "Text Area 1", task.section);
        setLucidColumn(row, headers, "Title", task.label);
        setLucidColumn(row, headers, "Start Date", task.start);
        setLucidColumn(row, headers, "End Date", task.end);
        setLucidColumn(row, headers, "Status", status, 0);
        setLucidColumn(row, headers, "Status", status, 1);
        setLucidColumn(row, headers, "Name", task.label, 1);
        rows.push(row);
    }
    return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}
function diagramToLucidCsvJourney(journey) {
    const headers = LUCID_HEADERS.journey;
    const rows = [];
    rows.push(headers);
    rows.push(buildLucidRow(headers, {
        Id: "1",
        Name: "Document",
        "Text Area 1": journey.title || "User journey"
    }));
    rows.push(buildLucidRow(headers, {
        Id: "2",
        Name: "Page",
        "Text Area 1": "Page 1"
    }));
    let nextId = 3;
    for (const step of journey.steps) {
        rows.push(buildLucidRow(headers, {
            Id: String(nextId++),
            Name: "Process",
            "Shape Library": "Flowchart Shapes/Containers",
            "Page ID": "2",
            "Text Area 1": step.task,
            "Text Area 2": `Stage: ${step.section}`,
            "Text Area 3": `Score: ${step.score}`,
            "Text Area 4": step.personas.join(", ")
        }));
    }
    return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}
function buildLucidRow(headers, values) {
    const row = createLucidRow(headers);
    for (const [key, value] of Object.entries(values)) {
        setLucidColumn(row, headers, key, value);
    }
    return row;
}
function createLucidRow(headers) {
    return headers.map(() => "");
}
function setLucidColumn(row, headers, column, value, occurrence = 0) {
    let count = 0;
    for (let i = 0; i < headers.length; i += 1) {
        if (headers[i] !== column)
            continue;
        if (count === occurrence) {
            row[i] = value;
            return;
        }
        count += 1;
    }
}
function mapGanttStatus(status) {
    switch (status) {
        case "done":
            return "Done";
        case "active":
            return "In Progress";
        case "crit":
            return "At Risk";
        default:
            return "New";
    }
}
function csvEscape(value) {
    if (/[",\n]/.test(value)) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}
const MAGIC_MARKER = "%% mermaid-magic";
function hasMagicMarker(content) {
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed)
            continue;
        return trimmed === MAGIC_MARKER;
    }
    return false;
}
function stripMagicMarker(content) {
    const lines = content.split(/\r?\n/);
    const filtered = [];
    let markerRemoved = false;
    for (const line of lines) {
        if (!markerRemoved && line.trim() === MAGIC_MARKER) {
            markerRemoved = true;
            continue;
        }
        filtered.push(line);
    }
    return filtered.join("\n");
}
function parseMermaidToDiagram(content, previous) {
    const cleaned = stripMagicMarker(content);
    const rawLines = cleaned.split(/\r?\n/);
    const lines = rawLines
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith("%%"));
    if (lines.length === 0) {
        return null;
    }
    const header = lines[0].toLowerCase();
    const base = normalizeDiagram(previous);
    if (header.startsWith("sequencediagram")) {
        const parsed = parseSequenceDiagram(lines.slice(1));
        base.sequence = parsed.sequence;
        base.type = "sequence";
        base.nextId = computeNextId(base, base.nextId);
        return base;
    }
    if (header.startsWith("pie")) {
        const parsed = parsePieDiagram(lines);
        base.pie = parsed.pie;
        base.type = "pie";
        base.nextId = computeNextId(base, base.nextId);
        return base;
    }
    if (header.startsWith("gantt")) {
        const parsed = parseGanttDiagram(lines.slice(1));
        base.gantt = parsed.gantt;
        base.type = "gantt";
        base.nextId = computeNextId(base, base.nextId);
        return base;
    }
    if (header.startsWith("journey")) {
        const parsed = parseJourneyDiagram(lines.slice(1));
        base.journey = parsed.journey;
        base.type = "journey";
        base.nextId = computeNextId(base, base.nextId);
        return base;
    }
    if (header.startsWith("flowchart") || header.startsWith("graph")) {
        const parsed = parseFlowchartDiagram(lines.slice(1));
        base.flowchart = parsed.flowchart;
        base.type = "flowchart";
        base.nextId = computeNextId(base, base.nextId);
        return base;
    }
    const parsed = parseFlowchartDiagram(lines);
    base.flowchart = parsed.flowchart;
    base.type = "flowchart";
    base.nextId = computeNextId(base, base.nextId);
    return base;
}
function parseFlowchartDiagram(lines) {
    const nodes = new Map();
    const styles = new Map();
    let nextId = 1;
    const allocateId = (token) => {
        const existing = nodes.get(token);
        if (existing)
            return existing.id;
        const numericMatch = token.match(/^N(\d+)$/);
        if (numericMatch) {
            const id = Number(numericMatch[1]);
            if (id >= nextId)
                nextId = id + 1;
            return id;
        }
        const id = nextId;
        nextId += 1;
        return id;
    };
    const ensureNode = (token, label, shape) => {
        const existing = nodes.get(token);
        if (existing) {
            if (label)
                existing.label = label;
            if (shape)
                existing.shape = shape;
            return existing;
        }
        const id = allocateId(token);
        const node = {
            id,
            label: label ?? token,
            x: 0,
            y: 0,
            ...DEFAULT_NODE,
            shape: shape ?? DEFAULT_NODE.shape
        };
        nodes.set(token, node);
        return node;
    };
    const edges = [];
    for (const line of lines) {
        const styleMatch = line.match(/^style\s+(\S+)\s+(.+)$/i);
        if (styleMatch) {
            const target = styleMatch[1];
            const styleParts = styleMatch[2].split(",");
            const updates = {};
            for (const part of styleParts) {
                const [key, value] = part.split(":").map((item) => item.trim());
                if (!key || !value)
                    continue;
                if (key === "fill")
                    updates.fill = value;
                if (key === "stroke")
                    updates.stroke = value;
                if (key === "color")
                    updates.textColor = value;
            }
            styles.set(target, updates);
            continue;
        }
        const edgeMatch = line.match(/^(\S+)\s*(<-->|-->|---|-\.\->|==>)\s*(?:\|(.+)\|\s*)?(\S+)$/);
        if (edgeMatch) {
            const fromToken = edgeMatch[1];
            const arrow = edgeMatch[2];
            const label = edgeMatch[3] ? unescapeMermaidText(edgeMatch[3]) : "";
            const toToken = edgeMatch[4];
            const fromNode = ensureNode(fromToken);
            const toNode = ensureNode(toToken);
            const id = nextId++;
            edges.push({
                id,
                from: fromNode.id,
                to: toNode.id,
                label,
                stroke: DEFAULT_EDGE.stroke,
                arrow: arrowFromMermaid(arrow)
            });
            continue;
        }
        const decisionMatch = line.match(/^(\S+)\s*\{(.+)\}$/);
        if (decisionMatch) {
            const token = decisionMatch[1];
            const label = unescapeMermaidText(decisionMatch[2]);
            ensureNode(token, label, "decision");
            continue;
        }
        const terminatorMatch = line.match(/^(\S+)\s*\(\[(.+)\]\)$/);
        if (terminatorMatch) {
            const token = terminatorMatch[1];
            const label = unescapeMermaidText(terminatorMatch[2]);
            ensureNode(token, label, "terminator");
            continue;
        }
        const processMatch = line.match(/^(\S+)\s*\["(.+)"\]$/);
        if (processMatch) {
            const token = processMatch[1];
            const label = unescapeMermaidText(processMatch[2]);
            ensureNode(token, label, "process");
            continue;
        }
        const bracketMatch = line.match(/^(\S+)\s*\[(.+)\]$/);
        if (bracketMatch) {
            const token = bracketMatch[1];
            const label = unescapeMermaidText(bracketMatch[2]);
            ensureNode(token, label, "process");
            continue;
        }
    }
    const nodeList = Array.from(nodes.values());
    const cols = 4;
    const xStart = 180;
    const yStart = 140;
    const xGap = 220;
    const yGap = 140;
    nodeList.forEach((node, index) => {
        if (node.x === 0 && node.y === 0) {
            node.x = xStart + (index % cols) * xGap;
            node.y = yStart + Math.floor(index / cols) * yGap;
        }
    });
    for (const [token, update] of styles.entries()) {
        const node = nodes.get(token);
        if (!node)
            continue;
        if (update.fill)
            node.fill = update.fill;
        if (update.stroke)
            node.stroke = update.stroke;
        if (update.textColor)
            node.textColor = update.textColor;
    }
    return { flowchart: { nodes: nodeList, edges } };
}
function parsePieDiagram(lines) {
    let title = "";
    const slices = [];
    let nextId = 1;
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed)
            continue;
        if (trimmed.toLowerCase().startsWith("pie")) {
            const rest = trimmed.slice(3).trim();
            if (rest.toLowerCase().startsWith("title")) {
                title = rest.slice(5).trim();
            }
            continue;
        }
        if (trimmed.toLowerCase().startsWith("title")) {
            title = trimmed.slice(5).trim();
            continue;
        }
        const match = trimmed.match(/^"?(.+?)"?\s*:\s*([0-9.]+)$/);
        if (!match)
            continue;
        const label = match[1].trim();
        const value = Number(match[2]);
        slices.push({
            id: nextId++,
            label,
            value: Number.isFinite(value) ? value : 0,
            color: DEFAULT_PIE_SLICE.color
        });
    }
    return { pie: { title, slices } };
}
function parseGanttDiagram(lines) {
    let title = "";
    let dateFormat = "YYYY-MM-DD";
    let currentSection = "General";
    const tasks = [];
    let nextId = 1;
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed)
            continue;
        const lower = trimmed.toLowerCase();
        if (lower.startsWith("title")) {
            title = trimmed.slice(5).trim();
            continue;
        }
        if (lower.startsWith("dateformat")) {
            dateFormat = trimmed.slice(10).trim() || dateFormat;
            continue;
        }
        if (lower.startsWith("section")) {
            currentSection = trimmed.slice(7).trim() || "General";
            continue;
        }
        const parts = trimmed.split(":");
        if (parts.length < 2)
            continue;
        const label = parts[0].trim();
        const rest = parts.slice(1).join(":");
        const tokens = rest
            .split(",")
            .map((token) => token.trim())
            .filter((token) => token.length > 0);
        let status = "";
        let start = "";
        let end = "";
        for (const token of tokens) {
            const statusToken = token.toLowerCase();
            if (!status && isGanttStatus(statusToken)) {
                status = statusToken;
                continue;
            }
            if (!start) {
                start = token;
                continue;
            }
            if (!end) {
                end = token;
            }
        }
        if (!start && tokens.length >= 2) {
            start = tokens[0];
            end = tokens[1];
        }
        tasks.push({
            id: nextId++,
            section: currentSection,
            label,
            start,
            end,
            status
        });
    }
    return { gantt: { title, dateFormat, tasks } };
}
function parseJourneyDiagram(lines) {
    let title = "";
    let currentSection = "Journey";
    const steps = [];
    let nextId = 1;
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed)
            continue;
        const lower = trimmed.toLowerCase();
        if (lower.startsWith("title")) {
            title = trimmed.slice(5).trim();
            continue;
        }
        if (lower.startsWith("section")) {
            currentSection = trimmed.slice(7).trim() || "Journey";
            continue;
        }
        const parts = trimmed.split(":").map((part) => part.trim());
        if (parts.length < 2)
            continue;
        const task = parts[0];
        const score = Number(parts[1]);
        const personas = parts.slice(2).join(":");
        steps.push({
            id: nextId++,
            section: currentSection,
            task,
            score: Number.isFinite(score) ? score : DEFAULT_JOURNEY_STEP.score,
            personas: personas
                ? personas.split(",").map((p) => p.trim()).filter(Boolean)
                : []
        });
    }
    return { journey: { title, steps } };
}
function parseSequenceDiagram(lines) {
    const participants = [];
    const messages = [];
    const aliasToId = new Map();
    let nextId = 1;
    const ensureParticipant = (alias, name) => {
        if (aliasToId.has(alias))
            return aliasToId.get(alias);
        const numericMatch = alias.match(/^P(\d+)$/);
        const id = numericMatch ? Number(numericMatch[1]) : nextId;
        if (id >= nextId) {
            nextId = id + 1;
        }
        else {
            nextId += 1;
        }
        aliasToId.set(alias, id);
        participants.push({ id, name: name ?? alias });
        return id;
    };
    for (const line of lines) {
        const participantMatch = line.match(/^participant\s+(.+)$/i);
        if (participantMatch) {
            const rest = participantMatch[1].trim();
            const asMatch = rest.match(/^(\S+)\s+as\s+(.+)$/i);
            if (asMatch) {
                const alias = asMatch[1].trim();
                const name = unescapeMermaidText(stripQuotes(asMatch[2].trim()));
                ensureParticipant(alias, name);
            }
            else {
                const name = unescapeMermaidText(stripQuotes(rest));
                const alias = name.replace(/\s+/g, "");
                ensureParticipant(alias, name);
            }
            continue;
        }
        const messageMatch = line.match(/^(\S+)\s*([\-]{1,2}>>?)\s*(\S+)(?:\s*:\s*(.+))?$/);
        if (messageMatch) {
            const fromAlias = messageMatch[1];
            const arrow = messageMatch[2];
            const toAlias = messageMatch[3];
            const label = messageMatch[4] ? unescapeMermaidText(messageMatch[4]) : "";
            const fromId = ensureParticipant(fromAlias);
            const toId = ensureParticipant(toAlias);
            messages.push({
                id: nextId++,
                from: fromId,
                to: toId,
                label,
                line: arrow.startsWith("--") ? "dashed" : "solid"
            });
        }
    }
    return { sequence: { participants, messages } };
}
function stripQuotes(value) {
    const trimmed = value.trim();
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        return trimmed.slice(1, -1);
    }
    return trimmed;
}
function computeNextId(diagram, fallback) {
    const maxFlowNode = diagram.flowchart.nodes.reduce((max, node) => Math.max(max, node.id), 0);
    const maxFlowEdge = diagram.flowchart.edges.reduce((max, edge) => Math.max(max, edge.id), 0);
    const maxParticipant = diagram.sequence.participants.reduce((max, participant) => Math.max(max, participant.id), 0);
    const maxMessage = diagram.sequence.messages.reduce((max, message) => Math.max(max, message.id), 0);
    const maxPie = diagram.pie.slices.reduce((max, slice) => Math.max(max, slice.id), 0);
    const maxGantt = diagram.gantt.tasks.reduce((max, task) => Math.max(max, task.id), 0);
    const maxJourney = diagram.journey.steps.reduce((max, step) => Math.max(max, step.id), 0);
    const maxId = Math.max(maxFlowNode, maxFlowEdge, maxParticipant, maxMessage, maxPie, maxGantt, maxJourney);
    const next = Number(fallback) || 1;
    return next <= maxId ? maxId + 1 : next;
}
async function openMermaidText(diagram) {
    const content = `${MAGIC_MARKER}\n${diagramToMermaid(diagram)}`;
    const doc = await vscode.workspace.openTextDocument({
        content,
        language: "mermaid"
    });
    await vscode.window.showTextDocument(doc, { preview: false });
}
function getWebviewContent(webview, extensionUri) {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "editor.js"));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "editor.css"));
    const nonce = getNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <link href="${styleUri}" rel="stylesheet">
  <title>Mermaid Magic</title>
</head>
<body>
  <div id="app">
    <div class="canvas-pane">
      <div id="text-drawer" class="drawer" aria-hidden="true">
        <h2>Mermaid Text</h2>
        <textarea id="mermaid-output"></textarea>
        <div class="drawer-actions">
          <button id="copy-mermaid">Copy Mermaid</button>
          <button id="open-text">Open Text</button>
          <button id="apply-text">Apply Text</button>
          <button id="close-text">Close</button>
        </div>
      </div>
      <svg id="canvas" viewBox="0 0 1200 800" aria-label="Diagram canvas" tabindex="0"></svg>
    </div>
    <div class="side-pane">
      <section class="diagram-section">
        <h2>Diagram</h2>
        <div class="field">
          <label for="diagram-type">Type</label>
          <select id="diagram-type">
            <option value="flowchart">Flowchart</option>
            <option value="sequence">Sequence</option>
            <option value="pie">Pie Chart</option>
            <option value="gantt">Gantt</option>
            <option value="journey">User Journey</option>
          </select>
        </div>
        <div class="field button-row">
          <button id="toggle-text">Mermaid Text</button>
          <button id="export-lucid" class="flowchart-only">Export to Lucid</button>
        </div>
      </section>
      <section class="flowchart-only actions-section">
        <h2>Actions</h2>
        <div class="field button-row">
          <button id="add-node">Add Node</button>
          <button id="delete-node">Delete Node</button>
        </div>
        <div class="field button-row">
          <button id="add-edge">Add Edge</button>
          <button id="delete-edge">Delete Edge</button>
        </div>
      </section>
      <section class="flowchart-only">
        <h2>Node</h2>
        <div class="field node-select-field">
          <label for="node-select">Selected</label>
          <select id="node-select"></select>
        </div>
        <div class="field node-label-field">
          <label for="node-label">Text</label>
          <input id="node-label" type="text" />
        </div>
        <div class="field">
          <label for="node-shape">Shape</label>
          <select id="node-shape">
            <option value="process">Process</option>
            <option value="decision">Decision</option>
            <option value="terminator">Terminator</option>
          </select>
        </div>
        <div class="field">
          <label for="node-fill">Fill</label>
          <input id="node-fill" type="color" />
        </div>
        <div class="field">
          <label for="node-stroke">Stroke</label>
          <input id="node-stroke" type="color" />
        </div>
        <div class="field node-text-color-field">
          <label for="node-text-color">Text</label>
          <input id="node-text-color" type="color" />
        </div>
      </section>
      <section class="pie-only">
        <h2>Pie</h2>
        <div class="field">
          <label for="pie-title">Title</label>
          <input id="pie-title" type="text" />
        </div>
        <div class="field">
          <label>Slices</label>
          <div id="pie-slices" class="item-list"></div>
        </div>
        <div class="field">
          <button id="add-pie-slice">Add Slice</button>
        </div>
      </section>
      <section class="gantt-only">
        <h2>Gantt</h2>
        <div class="field">
          <label for="gantt-title">Title</label>
          <input id="gantt-title" type="text" />
        </div>
        <div class="field">
          <label for="gantt-date-format">Date Format</label>
          <input id="gantt-date-format" type="text" />
        </div>
        <div class="field">
          <label>Tasks</label>
          <div id="gantt-tasks" class="item-list"></div>
        </div>
        <div class="field">
          <button id="add-gantt-task">Add Task</button>
        </div>
      </section>
      <section class="journey-only">
        <h2>User Journey</h2>
        <div class="field">
          <label for="journey-title">Title</label>
          <input id="journey-title" type="text" />
        </div>
        <div class="field">
          <label>Steps</label>
          <div id="journey-steps" class="item-list"></div>
        </div>
        <div class="field">
          <button id="add-journey-step">Add Step</button>
        </div>
      </section>
      <section class="flowchart-only edge-section">
        <h2>Edge</h2>
        <div class="field">
          <label>Connected Edges</label>
          <div id="edge-list" class="edge-list" role="listbox"></div>
        </div>
        <div class="field">
          <label for="edge-from">From</label>
          <select id="edge-from"></select>
        </div>
        <div class="field">
          <label for="edge-to">To</label>
          <select id="edge-to"></select>
        </div>
        <div class="field">
          <label for="edge-label">Label</label>
          <input id="edge-label" type="text" />
        </div>
        <div class="field">
          <label for="edge-stroke">Stroke</label>
          <input id="edge-stroke" type="color" />
        </div>
        <div class="field">
          <label for="edge-arrow">Arrow</label>
          <select id="edge-arrow">
            <option value="arrow" aria-label="Arrow">→</option>
            <option value="dashed" aria-label="Dashed arrow">⇢</option>
            <option value="double" aria-label="Double arrow">↔</option>
            <option value="thick" aria-label="Thick arrow">⟹</option>
            <option value="none" aria-label="No arrow">—</option>
          </select>
        </div>
      </section>
      <section class="sequence-only">
        <h2>Participant</h2>
        <div class="field">
          <label for="participant-select">Selected</label>
          <select id="participant-select"></select>
        </div>
        <div class="field">
          <label for="participant-name">Name</label>
          <input id="participant-name" type="text" />
        </div>
        <div class="field">
          <button id="add-participant">Add Participant</button>
          <button id="delete-participant">Delete Participant</button>
        </div>
      </section>
      <section class="sequence-only">
        <h2>Message</h2>
        <div class="field">
          <label for="message-select">Selected</label>
          <select id="message-select"></select>
        </div>
        <div class="field">
          <label for="message-from">From</label>
          <select id="message-from"></select>
        </div>
        <div class="field">
          <label for="message-to">To</label>
          <select id="message-to"></select>
        </div>
        <div class="field">
          <label for="message-label">Label</label>
          <input id="message-label" type="text" />
        </div>
        <div class="field">
          <label for="message-line">Line</label>
          <select id="message-line">
            <option value="solid">Solid</option>
            <option value="dashed">Dashed</option>
          </select>
        </div>
        <div class="field">
          <button id="add-message">Add Message</button>
          <button id="delete-message">Delete Message</button>
        </div>
      </section>
    </div>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
function getNoWorkspaceHtml() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mermaid Magic</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 16px; }
  </style>
</head>
<body>
  <h2>Mermaid Magic</h2>
  <p>Open a workspace folder to use the editor.</p>
</body>
</html>`;
}
function getSidebarHtml(webview) {
    const nonce = getNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Mermaid Magic</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 16px; }
    .card { border: 1px solid #d1d5db; border-radius: 8px; padding: 12px; background: #f9fafb; }
    h2 { margin: 0 0 8px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; }
    p { margin: 0; font-size: 13px; color: #374151; }
    button { margin-top: 8px; padding: 6px 10px; border-radius: 6px; border: 1px solid #cbd5f5; background: #ffffff; cursor: pointer; }
    ul { list-style: none; padding: 0; margin: 12px 0 0 0; display: flex; flex-direction: column; gap: 6px; }
    li { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: #374151; gap: 8px; }
    .row { display: flex; gap: 8px; flex-wrap: wrap; }
    .file-btn { flex: 1; text-align: left; }
    .active { background: #e0e7ff; border-color: #6366f1; }
    .close { border-color: #fca5a5; color: #b91c1c; }
  </style>
</head>
<body>
  <div class="card">
    <h2>Mermaid Magic</h2>
    <p>Select a Mermaid file to load into the editor.</p>
    <div class="row">
      <button id="open-editor">Open Editor</button>
      <button id="close-editor" class="close">Close Editor</button>
      <button id="refresh-files">Refresh Files</button>
    </div>
    <ul id="file-list"></ul>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const list = document.getElementById("file-list");
    document.getElementById("open-editor").addEventListener("click", () => {
      vscode.postMessage({ type: "openEditor" });
    });
    document.getElementById("close-editor").addEventListener("click", () => {
      vscode.postMessage({ type: "closeEditor" });
    });
    document.getElementById("refresh-files").addEventListener("click", () => {
      vscode.postMessage({ type: "refreshFiles" });
    });
    window.addEventListener("message", (event) => {
      const message = event.data;
      if (message.type !== "files") return;
      list.innerHTML = "";
      if (!message.files.length) {
        const li = document.createElement("li");
        li.textContent = "No Mermaid files found.";
        list.appendChild(li);
        return;
      }
      message.files.forEach((file) => {
        const li = document.createElement("li");
        const button = document.createElement("button");
        button.classList.add("file-btn");
        if (message.active && message.active === file.path) {
          button.classList.add("active");
        }
        button.textContent = file.path;
        button.addEventListener("click", () => {
          vscode.postMessage({ type: "openFile", path: file.path });
        });
        li.appendChild(button);
        list.appendChild(li);
      });
    });
    vscode.postMessage({ type: "ready" });
  </script>
</body>
</html>`;
}
function getNonce() {
    let text = "";
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
//# sourceMappingURL=extension.js.map