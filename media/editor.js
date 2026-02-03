(() => {
  const vscode = acquireVsCodeApi();
  const svgNS = "http://www.w3.org/2000/svg";

  const canvas = document.getElementById("canvas");
  const mermaidOutput = document.getElementById("mermaid-output");
  const diagramType = document.getElementById("diagram-type");
  const textDrawer = document.getElementById("text-drawer");
  const toggleText = document.getElementById("toggle-text");
  const hamburgerToggle = document.getElementById("hamburger-toggle");
  const closeText = document.getElementById("close-text");
  const applyText = document.getElementById("apply-text");
  const exportLucid = document.getElementById("export-lucid");

  const nodeSelect = document.getElementById("node-select");
  const nodeLabel = document.getElementById("node-label");
  const nodeShape = document.getElementById("node-shape");
  const nodeFill = document.getElementById("node-fill");
  const nodeStroke = document.getElementById("node-stroke");
  const nodeTextColor = document.getElementById("node-text-color");

  const edgeList = document.getElementById("edge-list");
  const edgeFrom = document.getElementById("edge-from");
  const edgeTo = document.getElementById("edge-to");
  const edgeLabel = document.getElementById("edge-label");
  const edgeStroke = document.getElementById("edge-stroke");
  const edgeArrow = document.getElementById("edge-arrow");

  const pieTitle = document.getElementById("pie-title");
  const pieSlices = document.getElementById("pie-slices");
  const addPieSlice = document.getElementById("add-pie-slice");

  const ganttTitle = document.getElementById("gantt-title");
  const ganttDateFormat = document.getElementById("gantt-date-format");
  const ganttTasks = document.getElementById("gantt-tasks");
  const addGanttTask = document.getElementById("add-gantt-task");

  const journeyTitle = document.getElementById("journey-title");
  const journeySteps = document.getElementById("journey-steps");
  const addJourneyStep = document.getElementById("add-journey-step");

  const participantSelect = document.getElementById("participant-select");
  const participantName = document.getElementById("participant-name");
  const messageSelect = document.getElementById("message-select");
  const messageFrom = document.getElementById("message-from");
  const messageTo = document.getElementById("message-to");
  const messageLabel = document.getElementById("message-label");
  const messageLine = document.getElementById("message-line");

  const flowchartOnly = Array.from(document.querySelectorAll(".flowchart-only"));
  const sequenceOnly = Array.from(document.querySelectorAll(".sequence-only"));
  const pieOnly = Array.from(document.querySelectorAll(".pie-only"));
  const ganttOnly = Array.from(document.querySelectorAll(".gantt-only"));
  const journeyOnly = Array.from(document.querySelectorAll(".journey-only"));

  let diagram = null;
  let selectedNodeId = null;
  let selectedNodeIds = new Set();
  let selectedEdgeId = null;
  let selectedParticipantId = null;
  let selectedMessageId = null;
  let dragging = null;
  let panning = null;
  let edgeDrag = null;
  let selectionRect = null;
  const viewBox = { x: 0, y: 0, width: 1200, height: 800 };
  let renderPending = false;

  document.getElementById("add-node").addEventListener("click", () => {
    if (!diagram || diagram.type !== "flowchart") return;
    const id = allocateId();
    const node = {
      id,
      label: `Node ${id}`,
      x: 200 + Math.random() * 400,
      y: 140 + Math.random() * 200,
      width: 160,
      height: 64,
      shape: "process",
      fill: "#F2F2F2",
      stroke: "#333333",
      textColor: "#111111"
    };
    diagram.flowchart.nodes.push(node);
    setSelectedNodes([id]);
    commit();
  });

  document.getElementById("delete-node").addEventListener("click", () => {
    if (!diagram || diagram.type !== "flowchart" || selectedNodeId === null) return;
    diagram.flowchart.nodes = diagram.flowchart.nodes.filter((node) => node.id !== selectedNodeId);
    diagram.flowchart.edges = diagram.flowchart.edges.filter(
      (edge) => edge.from !== selectedNodeId && edge.to !== selectedNodeId
    );
    const nextId = diagram.flowchart.nodes[0]?.id ?? null;
    setSelectedNodes(nextId ? [nextId] : []);
    selectedEdgeId = diagram.flowchart.edges[0]?.id ?? null;
    commit();
  });

  document.getElementById("add-edge").addEventListener("click", () => {
    if (!diagram || diagram.type !== "flowchart") return;
    if (diagram.flowchart.nodes.length < 2) return;
    const from = Number(edgeFrom.value);
    const to = Number(edgeTo.value);
    if (!from || !to || from === to) return;
    const id = allocateId();
    const edge = {
      id,
      from,
      to,
      label: "",
      stroke: "#444444",
      arrow: "arrow"
    };
    diagram.flowchart.edges.push(edge);
    selectedEdgeId = id;
    commit();
  });

  document.getElementById("delete-edge").addEventListener("click", () => {
    if (!diagram || diagram.type !== "flowchart" || selectedEdgeId === null) return;
    diagram.flowchart.edges = diagram.flowchart.edges.filter((edge) => edge.id !== selectedEdgeId);
    selectedEdgeId = diagram.flowchart.edges[0]?.id ?? null;
    commit();
  });

  document.getElementById("add-participant").addEventListener("click", () => {
    if (!diagram || diagram.type !== "sequence") return;
    const id = allocateId();
    diagram.sequence.participants.push({ id, name: `Participant ${id}` });
    selectedParticipantId = id;
    commit();
  });

  document.getElementById("delete-participant").addEventListener("click", () => {
    if (!diagram || diagram.type !== "sequence" || selectedParticipantId === null) return;
    diagram.sequence.participants = diagram.sequence.participants.filter(
      (participant) => participant.id !== selectedParticipantId
    );
    diagram.sequence.messages = diagram.sequence.messages.filter(
      (message) => message.from !== selectedParticipantId && message.to !== selectedParticipantId
    );
    selectedParticipantId = diagram.sequence.participants[0]?.id ?? null;
    selectedMessageId = diagram.sequence.messages[0]?.id ?? null;
    commit();
  });

  document.getElementById("add-message").addEventListener("click", () => {
    if (!diagram || diagram.type !== "sequence") return;
    if (diagram.sequence.participants.length < 2) return;
    const from = Number(messageFrom.value);
    const to = Number(messageTo.value);
    if (!from || !to || from === to) return;
    const id = allocateId();
    diagram.sequence.messages.push({
      id,
      from,
      to,
      label: "",
      line: "solid"
    });
    selectedMessageId = id;
    commit();
  });

  document.getElementById("delete-message").addEventListener("click", () => {
    if (!diagram || diagram.type !== "sequence" || selectedMessageId === null) return;
    diagram.sequence.messages = diagram.sequence.messages.filter(
      (message) => message.id !== selectedMessageId
    );
    selectedMessageId = diagram.sequence.messages[0]?.id ?? null;
    commit();
  });

  document.getElementById("copy-mermaid").addEventListener("click", () => {
    vscode.postMessage({ type: "copyMermaid" });
  });

  document.getElementById("open-text").addEventListener("click", () => {
    vscode.postMessage({ type: "openText" });
  });

  if (exportLucid) {
    exportLucid.addEventListener("click", () => {
      vscode.postMessage({ type: "exportLucid" });
    });
  }

  if (applyText && mermaidOutput) {
    applyText.addEventListener("click", () => {
      vscode.postMessage({ type: "importMermaidText", content: mermaidOutput.value });
    });
  }

  if (toggleText && textDrawer) {
    toggleText.addEventListener("click", () => {
      const isOpen = textDrawer.classList.contains("open");
      setDrawerOpen(!isOpen);
    });
  }

  if (hamburgerToggle && textDrawer) {
    hamburgerToggle.addEventListener("click", () => {
      const isOpen = textDrawer.classList.contains("open");
      setDrawerOpen(!isOpen);
    });
  }

  if (closeText && textDrawer) {
    closeText.addEventListener("click", () => setDrawerOpen(false));
  }

  diagramType.addEventListener("change", () => {
    if (!diagram) return;
    diagram.type = diagramType.value;
    syncSelections();
    applyModeVisibility();
    commit();
  });

  nodeSelect.addEventListener("change", () => {
    const nextId = Number(nodeSelect.value) || null;
    if (nextId) {
      setSelectedNodes([nextId]);
    } else {
      setSelectedNodes([]);
    }
    updateNodeFields();
    updateEdgeFields();
    render();
  });

  nodeLabel.addEventListener("input", () => {
    const node = getSelectedNode();
    if (!node) return;
    node.label = nodeLabel.value;
    commit();
  });

  nodeShape.addEventListener("change", () => {
    const nodes = getSelectedNodes();
    if (!nodes.length) return;
    nodes.forEach((node) => {
      node.shape = nodeShape.value;
    });
    commit();
  });

  nodeFill.addEventListener("input", () => {
    const nodes = getSelectedNodes();
    if (!nodes.length) return;
    nodes.forEach((node) => {
      node.fill = nodeFill.value;
    });
    commit();
  });

  nodeStroke.addEventListener("input", () => {
    const nodes = getSelectedNodes();
    if (!nodes.length) return;
    nodes.forEach((node) => {
      node.stroke = nodeStroke.value;
    });
    commit();
  });

  nodeTextColor.addEventListener("input", () => {
    const node = getSelectedNode();
    if (!node) return;
    node.textColor = nodeTextColor.value;
    commit();
  });

  edgeFrom.addEventListener("change", () => {
    const edge = getSelectedEdge();
    if (!edge) return;
    edge.from = Number(edgeFrom.value);
    commit();
  });

  edgeTo.addEventListener("change", () => {
    const edge = getSelectedEdge();
    if (!edge) return;
    edge.to = Number(edgeTo.value);
    commit();
  });

  edgeLabel.addEventListener("input", () => {
    const edge = getSelectedEdge();
    if (!edge) return;
    edge.label = edgeLabel.value;
    commit();
  });

  edgeStroke.addEventListener("input", () => {
    const edge = getSelectedEdge();
    if (!edge) return;
    edge.stroke = edgeStroke.value;
    commit();
  });

  edgeArrow.addEventListener("change", () => {
    const edge = getSelectedEdge();
    if (!edge) return;
    edge.arrow = edgeArrow.value;
    commit();
  });

  participantSelect.addEventListener("change", () => {
    selectedParticipantId = Number(participantSelect.value) || null;
    updateParticipantFields();
    render();
  });

  participantName.addEventListener("input", () => {
    const participant = getSelectedParticipant();
    if (!participant) return;
    participant.name = participantName.value;
    commit();
  });

  messageSelect.addEventListener("change", () => {
    selectedMessageId = Number(messageSelect.value) || null;
    updateMessageFields();
    render();
  });

  messageFrom.addEventListener("change", () => {
    const message = getSelectedMessage();
    if (!message) return;
    message.from = Number(messageFrom.value);
    commit();
  });

  messageTo.addEventListener("change", () => {
    const message = getSelectedMessage();
    if (!message) return;
    message.to = Number(messageTo.value);
    commit();
  });

  messageLabel.addEventListener("input", () => {
    const message = getSelectedMessage();
    if (!message) return;
    message.label = messageLabel.value;
    commit();
  });

  messageLine.addEventListener("change", () => {
    const message = getSelectedMessage();
    if (!message) return;
    message.line = messageLine.value;
    commit();
  });

  if (pieTitle) {
    pieTitle.addEventListener("input", () => {
      if (!diagram || diagram.type !== "pie") return;
      diagram.pie.title = pieTitle.value;
      commit();
    });
  }

  if (addPieSlice) {
    addPieSlice.addEventListener("click", () => {
      if (!diagram || diagram.type !== "pie") return;
      const id = allocateId();
      diagram.pie.slices.push({
        id,
        label: `Slice ${id}`,
        value: 10,
        color: pickSliceColor(diagram.pie.slices.length)
      });
      commit();
    });
  }

  if (ganttTitle) {
    ganttTitle.addEventListener("input", () => {
      if (!diagram || diagram.type !== "gantt") return;
      diagram.gantt.title = ganttTitle.value;
      commit();
    });
  }

  if (ganttDateFormat) {
    ganttDateFormat.addEventListener("input", () => {
      if (!diagram || diagram.type !== "gantt") return;
      diagram.gantt.dateFormat = ganttDateFormat.value;
      commit();
    });
  }

  if (addGanttTask) {
    addGanttTask.addEventListener("click", () => {
      if (!diagram || diagram.type !== "gantt") return;
      const id = allocateId();
      diagram.gantt.tasks.push({
        id,
        section: "Phase",
        label: `Task ${id}`,
        start: "2024-01-01",
        end: "2024-01-05",
        status: ""
      });
      commit();
    });
  }

  if (journeyTitle) {
    journeyTitle.addEventListener("input", () => {
      if (!diagram || diagram.type !== "journey") return;
      diagram.journey.title = journeyTitle.value;
      commit();
    });
  }

  if (addJourneyStep) {
    addJourneyStep.addEventListener("click", () => {
      if (!diagram || diagram.type !== "journey") return;
      const id = allocateId();
      diagram.journey.steps.push({
        id,
        section: "Stage",
        task: `Step ${id}`,
        score: 3,
        personas: ["User"]
      });
      commit();
    });
  }

  window.addEventListener("message", (event) => {
    const message = event.data;
    if (message.type === "loadDiagram") {
      const prevSelection = {
        node: selectedNodeId,
        nodes: Array.from(selectedNodeIds),
        edge: selectedEdgeId,
        participant: selectedParticipantId,
        message: selectedMessageId
      };
      diagram = normalizeDiagram(message.diagram);
      applyModeVisibility();
      restoreSelections(prevSelection);
      render();
      updateAllFields();
      updateMermaid(message.mermaid);
    }

    if (message.type === "sync") {
      updateMermaid(message.mermaid);
    }
  });

  const handleDeleteKey = (event) => {
    if (event.key !== "Delete" && event.key !== "Backspace") return;
    if (!diagram || diagram.type !== "flowchart") return;
    if (isEditingTarget(event.target)) return;
    if (!selectedNodeIds.size) return;
    event.preventDefault();
    const toRemove = new Set(selectedNodeIds);
    diagram.flowchart.nodes = diagram.flowchart.nodes.filter(
      (node) => !toRemove.has(node.id)
    );
    diagram.flowchart.edges = diagram.flowchart.edges.filter(
      (edge) => !toRemove.has(edge.from) && !toRemove.has(edge.to)
    );
    const nextId = diagram.flowchart.nodes[0]?.id ?? null;
    setSelectedNodes(nextId ? [nextId] : []);
    selectedEdgeId = diagram.flowchart.edges[0]?.id ?? null;
    commit();
  };

  window.addEventListener("keydown", handleDeleteKey);
  document.addEventListener("keydown", handleDeleteKey);

  canvas.addEventListener("pointerdown", (event) => {
    if (!diagram) return;
    if (canvas && canvas.focus) {
      canvas.focus();
    }
    if (event.button === 1) {
      const ctm = canvas.getScreenCTM();
      if (!ctm) return;
      const inverse = ctm.inverse();
      const start = clientToSvgPoint(event, inverse);
      if (!start) return;
      panning = {
        start,
        origin: { ...viewBox },
        inverse,
        pointerId: event.pointerId
      };
      canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }

    if (event.button !== 0) return;

    const edgeHandle = findAncestorWithClass(event.target, "edge-handle");
    if (edgeHandle && diagram.type === "flowchart") {
      const id = Number(edgeHandle.dataset.id);
      const node = diagram.flowchart.nodes.find((n) => n.id === id);
      if (!node) return;
      selectFlowchartNode(id);
      const startX = Number(edgeHandle.dataset.x);
      const startY = Number(edgeHandle.dataset.y);
      if (!Number.isFinite(startX) || !Number.isFinite(startY)) return;
      edgeDrag = {
        fromId: id,
        start: { x: startX, y: startY },
        current: { x: startX, y: startY },
        targetId: null,
        pointerId: event.pointerId
      };
      canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }

    const target = findAncestorWithClass(event.target, "canvas-node");
    if (target && diagram.type === "flowchart") {
      const id = Number(target.dataset.id);
      const node = diagram.flowchart.nodes.find((n) => n.id === id);
      if (!node) return;
      const isToggle = event.ctrlKey || event.metaKey;
      if (isToggle) {
        if (selectedNodeIds.has(id)) {
          selectedNodeIds.delete(id);
        } else {
          selectedNodeIds.add(id);
        }
        if (selectedNodeIds.size) {
          selectedNodeId = selectedNodeIds.has(id)
            ? id
            : Array.from(selectedNodeIds).slice(-1)[0];
        } else {
          selectedNodeId = null;
        }
        updateNodeFields();
        updateEdgeFields();
        render();
        return;
      }

      if (!selectedNodeIds.has(id)) {
        setSelectedNodes([id]);
      }

      const point = clientToSvgPoint(event);
      if (!point) return;
      const dragNodes = getSelectedNodes();
      dragging = {
        type: "nodes",
        start: { x: point.x, y: point.y },
        nodes: dragNodes.map((item) => ({ node: item, x: item.x, y: item.y })),
        pointerId: event.pointerId
      };
      canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }

    const isInteractive =
      !!findAncestorWithClass(event.target, "sequence-participant") ||
      !!findAncestorWithClass(event.target, "sequence-message");
    if (isInteractive) return;

    if (diagram.type === "flowchart") {
      const point = clientToSvgPoint(event);
      if (!point) return;
      selectionRect = {
        start: { x: point.x, y: point.y },
        current: { x: point.x, y: point.y },
        pointerId: event.pointerId,
        additive: event.ctrlKey || event.metaKey,
        moved: false
      };
      canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
    }
  });

  canvas.addEventListener("pointermove", (event) => {
    if (edgeDrag && event.pointerId === edgeDrag.pointerId) {
      const point = clientToSvgPoint(event);
      if (!point) return;
      edgeDrag.current = { x: point.x, y: point.y };
      const hovered = getFlowchartNodeAtPoint(point);
      edgeDrag.targetId =
        hovered && hovered !== edgeDrag.fromId ? hovered : null;
      scheduleRender();
      return;
    }
    if (dragging && event.pointerId === dragging.pointerId) {
      const point = clientToSvgPoint(event);
      if (!point) return;
      if (dragging.type === "nodes") {
        const dx = point.x - dragging.start.x;
        const dy = point.y - dragging.start.y;
        dragging.nodes.forEach((entry) => {
          entry.node.x = entry.x + dx;
          entry.node.y = entry.y + dy;
        });
      }
      scheduleRender();
      return;
    }
    if (selectionRect && event.pointerId === selectionRect.pointerId) {
      const point = clientToSvgPoint(event);
      if (!point) return;
      selectionRect.current = { x: point.x, y: point.y };
      if (!selectionRect.moved) {
        const dx = point.x - selectionRect.start.x;
        const dy = point.y - selectionRect.start.y;
        selectionRect.moved = Math.hypot(dx, dy) > 3;
      }
      scheduleRender();
      return;
    }
    if (panning && event.pointerId === panning.pointerId) {
      const point = clientToSvgPoint(event, panning.inverse);
      if (!point) return;
      const dx = panning.start.x - point.x;
      const dy = panning.start.y - point.y;
      viewBox.x = panning.origin.x + dx;
      viewBox.y = panning.origin.y + dy;
      applyViewBox();
    }
  });

  const releasePointer = (pointerId) => {
    if (pointerId !== null && canvas.hasPointerCapture(pointerId)) {
      canvas.releasePointerCapture(pointerId);
    }
  };

  const clearEdgeDrag = (commitEdge) => {
    if (!edgeDrag) return;
    const pointerId = edgeDrag.pointerId ?? null;
    const dragState = edgeDrag;
    edgeDrag = null;
    releasePointer(pointerId);
    if (!commitEdge) {
      render();
      return;
    }
    const target = dragState.targetId;
    if (!diagram || diagram.type !== "flowchart") return;
    if (!target || target === dragState.fromId) {
      render();
      return;
    }
    const id = allocateId();
    diagram.flowchart.edges.push({
      id,
      from: dragState.fromId,
      to: target,
      label: "",
      stroke: "#444444",
      arrow: "arrow"
    });
    selectedEdgeId = id;
    commit();
  };

  const clearDragState = (commitChanges) => {
    if (!dragging) return;
    const pointerId = dragging.pointerId ?? null;
    dragging = null;
    releasePointer(pointerId);
    if (commitChanges) {
      commit();
    }
  };

  const clearPanState = () => {
    if (!panning) return;
    const pointerId = panning.pointerId ?? null;
    panning = null;
    releasePointer(pointerId);
  };

  const clearSelectionRect = () => {
    if (!selectionRect) return;
    const rectState = selectionRect;
    selectionRect = null;
    releasePointer(rectState.pointerId ?? null);
    if (!diagram || diagram.type !== "flowchart") return;
    if (!rectState.moved) {
      if (!rectState.additive) {
        setSelectedNodes([]);
        updateNodeFields();
        updateEdgeFields();
        render();
      } else {
        render();
      }
      return;
    }
    const selected = getNodesInRect(rectState.start, rectState.current);
    if (rectState.additive) {
      selected.forEach((id) => selectedNodeIds.add(id));
      selectedNodeId = selected.length ? selected[selected.length - 1] : selectedNodeId;
    } else {
      setSelectedNodes(selected);
    }
    updateNodeFields();
    updateEdgeFields();
    render();
  };

  canvas.addEventListener("pointerup", (event) => {
    if (edgeDrag && event.pointerId === edgeDrag.pointerId) {
      clearEdgeDrag(true);
      return;
    }
    if (selectionRect && event.pointerId === selectionRect.pointerId) {
      clearSelectionRect();
      return;
    }
    if (dragging) {
      clearDragState(true);
      return;
    }
    if (panning) {
      clearPanState();
    }
  });

  canvas.addEventListener("pointercancel", (event) => {
    if (edgeDrag && event.pointerId === edgeDrag.pointerId) {
      clearEdgeDrag(false);
      return;
    }
    if (selectionRect && event.pointerId === selectionRect.pointerId) {
      selectionRect = null;
      releasePointer(event.pointerId);
      render();
      return;
    }
    if (dragging) {
      clearDragState(true);
    }
    if (panning) {
      clearPanState();
    }
  });

  canvas.addEventListener(
    "wheel",
    (event) => {
      if (!diagram) return;
      event.preventDefault();
      const point = clientToSvgPoint(event);
      if (!point) return;
      const zoomFactor = Math.pow(1.0015, event.deltaY);
      const nextWidth = clamp(viewBox.width * zoomFactor, 300, 4000);
      const nextHeight = (nextWidth / viewBox.width) * viewBox.height;
      const ratioX = (point.x - viewBox.x) / viewBox.width;
      const ratioY = (point.y - viewBox.y) / viewBox.height;
      viewBox.x = point.x - nextWidth * ratioX;
      viewBox.y = point.y - nextHeight * ratioY;
      viewBox.width = nextWidth;
      viewBox.height = nextHeight;
      applyViewBox();
    },
    { passive: false }
  );

  canvas.addEventListener("click", (event) => {
    if (!diagram || diagram.type !== "sequence") return;
    const participantEl = findAncestorWithClass(event.target, "sequence-participant");
    if (participantEl) {
      selectedParticipantId = Number(participantEl.dataset.id);
      selectedMessageId = null;
      updateParticipantFields();
      updateMessageFields();
      render();
      return;
    }
    const messageEl = findAncestorWithClass(event.target, "sequence-message");
    if (messageEl) {
      selectedMessageId = Number(messageEl.dataset.id);
      updateMessageFields();
      render();
    }
  });

  canvas.addEventListener("dblclick", (event) => {
    if (!diagram || diagram.type !== "flowchart") return;
    const target = findAncestorWithClass(event.target, "canvas-node");
    if (!target) return;
    const id = Number(target.dataset.id);
    const node = diagram.flowchart.nodes.find((n) => n.id === id);
    if (!node) return;
    selectFlowchartNode(id);
    const updated = window.prompt("Edit node text", node.label);
    if (updated === null) return;
    node.label = updated;
    commit();
  });

  function commit() {
    if (!diagram) return;
    vscode.postMessage({ type: "updateDiagram", diagram });
    render();
    updateAllFields();
  }

  function updateMermaid(text) {
    if (mermaidOutput) {
      mermaidOutput.value = text || "";
    }
  }

  function setDrawerOpen(isOpen) {
    if (!textDrawer) return;
    textDrawer.classList.toggle("open", isOpen);
    textDrawer.setAttribute("aria-hidden", (!isOpen).toString());
  }

  function updateAllFields() {
    if (!diagram) return;
    if (diagram.type === "flowchart") {
      updateNodeFields();
      updateEdgeFields();
      return;
    }
    if (diagram.type === "sequence") {
      updateParticipantFields();
      updateMessageFields();
      return;
    }
    if (diagram.type === "pie") {
      updatePieFields();
      return;
    }
    if (diagram.type === "gantt") {
      updateGanttFields();
      return;
    }
    if (diagram.type === "journey") {
      updateJourneyFields();
    }
  }

  function applyModeVisibility() {
    if (!diagram) return;
    diagramType.value = diagram.type;
    const flowchartHidden = diagram.type !== "flowchart";
    const sequenceHidden = diagram.type !== "sequence";
    const pieHidden = diagram.type !== "pie";
    const ganttHidden = diagram.type !== "gantt";
    const journeyHidden = diagram.type !== "journey";
    flowchartOnly.forEach((el) => el.classList.toggle("hidden", flowchartHidden));
    sequenceOnly.forEach((el) => el.classList.toggle("hidden", sequenceHidden));
    pieOnly.forEach((el) => el.classList.toggle("hidden", pieHidden));
    ganttOnly.forEach((el) => el.classList.toggle("hidden", ganttHidden));
    journeyOnly.forEach((el) => el.classList.toggle("hidden", journeyHidden));
    if (flowchartHidden) {
      document.body.classList.remove("multi-select");
    }
  }

  function syncSelections() {
    if (!diagram) return;
    if (diagram.type === "flowchart") {
      const firstId = diagram.flowchart.nodes[0]?.id ?? null;
      setSelectedNodes(firstId ? [firstId] : []);
      selectedEdgeId = diagram.flowchart.edges[0]?.id ?? null;
    } else if (diagram.type === "sequence") {
      selectedParticipantId = diagram.sequence.participants[0]?.id ?? null;
      selectedMessageId = diagram.sequence.messages[0]?.id ?? null;
    } else {
      setSelectedNodes([]);
      selectedEdgeId = null;
      selectedParticipantId = null;
      selectedMessageId = null;
    }
  }

  function restoreSelections(prev) {
    if (!diagram) return;
    if (diagram.type === "flowchart") {
      const validNodes = Array.isArray(prev.nodes)
        ? prev.nodes.filter((id) =>
            diagram.flowchart.nodes.some((node) => node.id === id)
          )
        : [];
      if (validNodes.length) {
        setSelectedNodes(validNodes);
      } else if (
        prev.node !== null &&
        diagram.flowchart.nodes.some((node) => node.id === prev.node)
      ) {
        setSelectedNodes([prev.node]);
      } else {
        const firstId = diagram.flowchart.nodes[0]?.id ?? null;
        setSelectedNodes(firstId ? [firstId] : []);
      }

      if (selectedNodeIds.size > 1) {
        selectedEdgeId = null;
      } else if (
        prev.edge !== null &&
        diagram.flowchart.edges.some((edge) => edge.id === prev.edge)
      ) {
        selectedEdgeId = prev.edge;
      } else {
        selectedEdgeId = diagram.flowchart.edges[0]?.id ?? null;
      }
    } else {
      if (diagram.type === "sequence") {
        if (
          prev.participant !== null &&
          diagram.sequence.participants.some(
            (participant) => participant.id === prev.participant
          )
        ) {
          selectedParticipantId = prev.participant;
        } else {
          selectedParticipantId = diagram.sequence.participants[0]?.id ?? null;
        }
        if (
          prev.message !== null &&
          diagram.sequence.messages.some((message) => message.id === prev.message)
        ) {
          selectedMessageId = prev.message;
        } else {
          selectedMessageId = diagram.sequence.messages[0]?.id ?? null;
        }
      } else {
        selectedParticipantId = null;
        selectedMessageId = null;
      }
    }
  }

  function updateNodeFields() {
    if (!diagram || diagram.type !== "flowchart") return;
    rebuildNodeSelect();
    const selectedNodes = getSelectedNodes();
    const node = getSelectedNode();
    const isMulti = selectedNodes.length > 1;
    document.body.classList.toggle("multi-select", isMulti);
    const disabled = !node;
    nodeLabel.disabled = disabled;
    nodeShape.disabled = disabled;
    nodeFill.disabled = disabled;
    nodeStroke.disabled = disabled;
    nodeTextColor.disabled = disabled || isMulti;
    nodeLabel.disabled = disabled || isMulti;
    if (!node) return;
    const baseNode = selectedNodes[0] ?? node;
    nodeLabel.value = baseNode.label;
    nodeShape.value = baseNode.shape;
    nodeFill.value = baseNode.fill;
    nodeStroke.value = baseNode.stroke;
    nodeTextColor.value = baseNode.textColor;
  }

  function updateEdgeFields() {
    if (!diagram || diagram.type !== "flowchart") return;
    rebuildEdgeList();
    rebuildEdgeNodeOptions();
    const edge = getSelectedEdge();
    const isMulti = selectedNodeIds.size > 1;
    const hasNodes = diagram.flowchart.nodes.length > 1;
    edgeFrom.disabled = !hasNodes || isMulti;
    edgeTo.disabled = !hasNodes || isMulti;
    const disabled = !edge || isMulti;
    edgeLabel.disabled = disabled;
    edgeStroke.disabled = disabled;
    edgeArrow.disabled = disabled;
    if (!edge) return;
    edgeFrom.value = String(edge.from);
    edgeTo.value = String(edge.to);
    edgeLabel.value = edge.label || "";
    edgeStroke.value = edge.stroke;
    edgeArrow.value = edge.arrow;
  }

  function updateParticipantFields() {
    if (!diagram || diagram.type !== "sequence") return;
    rebuildParticipantSelect();
    const participant = getSelectedParticipant();
    const disabled = !participant;
    participantName.disabled = disabled;
    if (!participant) return;
    participantName.value = participant.name;
  }

  function updateMessageFields() {
    if (!diagram || diagram.type !== "sequence") return;
    rebuildMessageSelect();
    rebuildMessageParticipantOptions();
    const message = getSelectedMessage();
    const hasParticipants = diagram.sequence.participants.length > 1;
    messageFrom.disabled = !hasParticipants;
    messageTo.disabled = !hasParticipants;
    const disabled = !message;
    messageLabel.disabled = disabled;
    messageLine.disabled = disabled;
    if (!message) return;
    messageFrom.value = String(message.from);
    messageTo.value = String(message.to);
    messageLabel.value = message.label || "";
    messageLine.value = message.line;
  }

  function updatePieFields() {
    if (!diagram || diagram.type !== "pie") return;
    if (pieTitle) {
      pieTitle.value = diagram.pie.title || "";
    }
    rebuildPieList();
  }

  function updateGanttFields() {
    if (!diagram || diagram.type !== "gantt") return;
    if (ganttTitle) {
      ganttTitle.value = diagram.gantt.title || "";
    }
    if (ganttDateFormat) {
      ganttDateFormat.value = diagram.gantt.dateFormat || "";
    }
    rebuildGanttList();
  }

  function updateJourneyFields() {
    if (!diagram || diagram.type !== "journey") return;
    if (journeyTitle) {
      journeyTitle.value = diagram.journey.title || "";
    }
    rebuildJourneyList();
  }

  function rebuildNodeSelect() {
    const previousId = selectedNodeId;
    nodeSelect.innerHTML = "";
    diagram.flowchart.nodes.forEach((node) => {
      const option = document.createElement("option");
      option.value = String(node.id);
      option.textContent = `${node.label} (${node.id})`;
      nodeSelect.appendChild(option);
    });
    if (selectedNodeIds.size) {
      if (previousId !== null && selectedNodeIds.has(previousId)) {
        selectedNodeId = previousId;
      } else {
        selectedNodeId = Array.from(selectedNodeIds).slice(-1)[0] ?? null;
      }
    } else if (
      previousId !== null &&
      diagram.flowchart.nodes.some((n) => n.id === previousId)
    ) {
      setSelectedNodes([previousId]);
    } else if (diagram.flowchart.nodes[0]) {
      setSelectedNodes([diagram.flowchart.nodes[0].id]);
    } else {
      setSelectedNodes([]);
    }
    if (selectedNodeId !== null) {
      nodeSelect.value = String(selectedNodeId);
    }
  }

  function rebuildEdgeList() {
    if (!edgeList) return;
    const previousId = selectedEdgeId;
    edgeList.innerHTML = "";
    if (selectedNodeIds.size > 1) {
      selectedEdgeId = null;
      const empty = document.createElement("div");
      empty.classList.add("edge-empty");
      empty.textContent = "Multiple nodes selected.";
      edgeList.appendChild(empty);
      return;
    }
    if (selectedNodeId === null) {
      selectedEdgeId = null;
      const empty = document.createElement("div");
      empty.classList.add("edge-empty");
      empty.textContent = "Select a node to see its edges.";
      edgeList.appendChild(empty);
      return;
    }

    const connected = diagram.flowchart.edges.filter(
      (edge) => edge.from === selectedNodeId || edge.to === selectedNodeId
    );
    if (!connected.length) {
      selectedEdgeId = null;
      const empty = document.createElement("div");
      empty.classList.add("edge-empty");
      empty.textContent = "No edges connected to this node.";
      edgeList.appendChild(empty);
      return;
    }

    if (previousId !== null && connected.some((edge) => edge.id === previousId)) {
      selectedEdgeId = previousId;
    } else {
      selectedEdgeId = connected[0].id;
    }

    connected.forEach((edge) => {
      const item = document.createElement("div");
      item.classList.add("edge-item");
      if (edge.id === selectedEdgeId) {
        item.classList.add("selected");
      }
      const labelText = edge.label ? edge.label : "Unlabeled edge";
      const text = document.createElement("button");
      text.type = "button";
      text.classList.add("edge-item-label");
      text.textContent = `${labelText} (${edge.from} → ${edge.to})`;
      text.addEventListener("click", () => {
        selectedEdgeId = edge.id;
        updateEdgeFields();
        render();
      });
      const del = document.createElement("button");
      del.type = "button";
      del.classList.add("edge-delete");
      del.setAttribute("aria-label", "Delete edge");
      del.textContent = "🗑";
      del.addEventListener("click", (event) => {
        event.stopPropagation();
        if (!diagram || diagram.type !== "flowchart") return;
        diagram.flowchart.edges = diagram.flowchart.edges.filter(
          (candidate) => candidate.id !== edge.id
        );
        if (selectedEdgeId === edge.id) {
          selectedEdgeId = diagram.flowchart.edges[0]?.id ?? null;
        }
        commit();
      });
      item.appendChild(text);
      item.appendChild(del);
      edgeList.appendChild(item);
    });
  }

  function rebuildEdgeNodeOptions() {
    const options = diagram.flowchart.nodes.map((node) => ({
      value: String(node.id),
      label: `${node.label} (${node.id})`
    }));

    [edgeFrom, edgeTo].forEach((select, index) => {
      const current = select.value;
      select.innerHTML = "";
      options.forEach((opt) => {
        const option = document.createElement("option");
        option.value = opt.value;
        option.textContent = opt.label;
        select.appendChild(option);
      });
      if (current) {
        select.value = current;
      } else if (options[index]) {
        select.value = options[index].value;
      } else if (options[0]) {
        select.value = options[0].value;
      }
    });
  }

  function selectFlowchartNode(id) {
    if (!diagram || diagram.type !== "flowchart") return;
    setSelectedNodes([id]);
    selectedEdgeId = null;
    updateNodeFields();
    updateEdgeFields();
    render();
  }

  function rebuildParticipantSelect() {
    participantSelect.innerHTML = "";
    diagram.sequence.participants.forEach((participant) => {
      const option = document.createElement("option");
      option.value = String(participant.id);
      option.textContent = `${participant.name} (${participant.id})`;
      participantSelect.appendChild(option);
    });
    if (selectedParticipantId === null && diagram.sequence.participants[0]) {
      selectedParticipantId = diagram.sequence.participants[0].id;
    }
    if (selectedParticipantId !== null) {
      participantSelect.value = String(selectedParticipantId);
    }
  }

  function rebuildMessageSelect() {
    const previousId = selectedMessageId;
    messageSelect.innerHTML = "";
    diagram.sequence.messages.forEach((message) => {
      const option = document.createElement("option");
      option.value = String(message.id);
      option.textContent = `${message.from} → ${message.to} (${message.id})`;
      messageSelect.appendChild(option);
    });
    if (previousId !== null && diagram.sequence.messages.some((m) => m.id === previousId)) {
      selectedMessageId = previousId;
    } else if (diagram.sequence.messages[0]) {
      selectedMessageId = diagram.sequence.messages[0].id;
    } else {
      selectedMessageId = null;
    }
    if (selectedMessageId !== null) {
      messageSelect.value = String(selectedMessageId);
    }
  }

  function rebuildMessageParticipantOptions() {
    const options = diagram.sequence.participants.map((participant) => ({
      value: String(participant.id),
      label: `${participant.name} (${participant.id})`
    }));

    [messageFrom, messageTo].forEach((select, index) => {
      const current = select.value;
      select.innerHTML = "";
      options.forEach((opt) => {
        const option = document.createElement("option");
        option.value = opt.value;
        option.textContent = opt.label;
        select.appendChild(option);
      });
      if (current) {
        select.value = current;
      } else if (options[index]) {
        select.value = options[index].value;
      } else if (options[0]) {
        select.value = options[0].value;
      }
    });
  }

  function rebuildPieList() {
    if (!pieSlices || !diagram || diagram.type !== "pie") return;
    pieSlices.innerHTML = "";
    diagram.pie.slices.forEach((slice) => {
      const row = document.createElement("div");
      row.classList.add("item-row");
      const label = document.createElement("input");
      label.type = "text";
      label.value = slice.label;
      label.addEventListener("input", () => {
        slice.label = label.value;
        commit();
      });
      const value = document.createElement("input");
      value.type = "number";
      value.min = "0";
      value.step = "1";
      value.classList.add("narrow");
      value.value = String(slice.value);
      value.addEventListener("input", () => {
        slice.value = Number(value.value) || 0;
        commit();
      });
      const color = document.createElement("input");
      color.type = "color";
      color.classList.add("narrow");
      color.value = slice.color;
      color.addEventListener("input", () => {
        slice.color = color.value;
        commit();
      });
      const del = document.createElement("button");
      del.type = "button";
      del.classList.add("item-delete");
      del.textContent = "🗑";
      del.addEventListener("click", () => {
        diagram.pie.slices = diagram.pie.slices.filter((item) => item.id !== slice.id);
        commit();
      });
      row.appendChild(label);
      row.appendChild(value);
      row.appendChild(color);
      row.appendChild(del);
      pieSlices.appendChild(row);
    });
  }

  function rebuildGanttList() {
    if (!ganttTasks || !diagram || diagram.type !== "gantt") return;
    ganttTasks.innerHTML = "";
    diagram.gantt.tasks.forEach((task) => {
      const row = document.createElement("div");
      row.classList.add("item-row");
      const section = document.createElement("input");
      section.type = "text";
      section.value = task.section;
      section.addEventListener("input", () => {
        task.section = section.value;
        commit();
      });
      const label = document.createElement("input");
      label.type = "text";
      label.value = task.label;
      label.addEventListener("input", () => {
        task.label = label.value;
        commit();
      });
      const start = document.createElement("input");
      start.type = "date";
      start.classList.add("narrow");
      start.value = task.start;
      start.addEventListener("input", () => {
        task.start = start.value;
        commit();
      });
      const end = document.createElement("input");
      end.type = "date";
      end.classList.add("narrow");
      end.value = task.end;
      end.addEventListener("input", () => {
        task.end = end.value;
        commit();
      });
      const status = document.createElement("select");
      status.classList.add("narrow");
      ["", "done", "active", "crit"].forEach((value) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value ? value : "status";
        status.appendChild(option);
      });
      status.value = task.status;
      status.addEventListener("change", () => {
        task.status = status.value;
        commit();
      });
      const del = document.createElement("button");
      del.type = "button";
      del.classList.add("item-delete");
      del.textContent = "🗑";
      del.addEventListener("click", () => {
        diagram.gantt.tasks = diagram.gantt.tasks.filter((item) => item.id !== task.id);
        commit();
      });
      row.appendChild(section);
      row.appendChild(label);
      row.appendChild(start);
      row.appendChild(end);
      row.appendChild(status);
      row.appendChild(del);
      ganttTasks.appendChild(row);
    });
  }

  function rebuildJourneyList() {
    if (!journeySteps || !diagram || diagram.type !== "journey") return;
    journeySteps.innerHTML = "";
    diagram.journey.steps.forEach((step) => {
      const row = document.createElement("div");
      row.classList.add("item-row");
      const section = document.createElement("input");
      section.type = "text";
      section.value = step.section;
      section.addEventListener("input", () => {
        step.section = section.value;
        commit();
      });
      const task = document.createElement("input");
      task.type = "text";
      task.value = step.task;
      task.addEventListener("input", () => {
        step.task = task.value;
        commit();
      });
      const score = document.createElement("input");
      score.type = "number";
      score.min = "1";
      score.max = "5";
      score.step = "1";
      score.classList.add("narrow");
      score.value = String(step.score);
      score.addEventListener("input", () => {
        step.score = Number(score.value) || 1;
        commit();
      });
      const personas = document.createElement("input");
      personas.type = "text";
      personas.value = step.personas.join(", ");
      personas.addEventListener("input", () => {
        step.personas = personas.value
          .split(",")
          .map((persona) => persona.trim())
          .filter(Boolean);
        commit();
      });
      const del = document.createElement("button");
      del.type = "button";
      del.classList.add("item-delete");
      del.textContent = "🗑";
      del.addEventListener("click", () => {
        diagram.journey.steps = diagram.journey.steps.filter((item) => item.id !== step.id);
        commit();
      });
      row.appendChild(section);
      row.appendChild(task);
      row.appendChild(score);
      row.appendChild(personas);
      row.appendChild(del);
      journeySteps.appendChild(row);
    });
  }

  function render() {
    if (!diagram) return;
    if (diagram.type === "flowchart") {
      renderFlowchart();
      return;
    }
    if (diagram.type === "sequence") {
      renderSequence();
      return;
    }
    if (diagram.type === "pie") {
      renderPie();
      return;
    }
    if (diagram.type === "gantt") {
      renderGantt();
      return;
    }
    if (diagram.type === "journey") {
      renderJourney();
    }
  }

  function scheduleRender() {
    if (renderPending) return;
    renderPending = true;
    requestAnimationFrame(() => {
      renderPending = false;
      render();
    });
  }

  function renderFlowchart() {
    canvas.innerHTML = "";
    applyViewBox();

    const defs = document.createElementNS(svgNS, "defs");
    const marker = document.createElementNS(svgNS, "marker");
    marker.setAttribute("id", "edge-arrow");
    marker.setAttribute("viewBox", "0 0 10 10");
    marker.setAttribute("refX", "8");
    marker.setAttribute("refY", "5");
    marker.setAttribute("markerUnits", "strokeWidth");
    marker.setAttribute("markerWidth", "6");
    marker.setAttribute("markerHeight", "6");
    marker.setAttribute("orient", "auto-start-reverse");
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
    path.setAttribute("fill", "context-stroke");
    marker.appendChild(path);
    defs.appendChild(marker);
    canvas.appendChild(defs);

    diagram.flowchart.edges.forEach((edge) => {
      const from = diagram.flowchart.nodes.find((node) => node.id === edge.from);
      const to = diagram.flowchart.nodes.find((node) => node.id === edge.to);
      if (!from || !to) return;
      const { start, end } = getEdgeEndpoints(from, to, edge.arrow);
      const line = document.createElementNS(svgNS, "line");
      line.setAttribute("x1", String(start.x));
      line.setAttribute("y1", String(start.y));
      line.setAttribute("x2", String(end.x));
      line.setAttribute("y2", String(end.y));
      line.setAttribute("stroke", edge.stroke);
      const baseWidth = edge.arrow === "thick" ? 3 : 2;
      line.setAttribute(
        "stroke-width",
        String(edge.id === selectedEdgeId ? baseWidth + 1 : baseWidth)
      );
      if (edge.arrow === "dashed") {
        line.setAttribute("stroke-dasharray", "6 6");
      }
      if (edge.arrow !== "none") {
        line.setAttribute("marker-end", "url(#edge-arrow)");
      }
      if (edge.arrow === "double") {
        line.setAttribute("marker-start", "url(#edge-arrow)");
      }
      canvas.appendChild(line);

      if (edge.label) {
        const midX = (start.x + end.x) / 2;
        const midY = (start.y + end.y) / 2;
        const text = document.createElementNS(svgNS, "text");
        text.setAttribute("x", midX);
        text.setAttribute("y", midY - 6);
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("fill", "#111827");
        text.setAttribute("font-size", "12");
        text.textContent = edge.label;
        canvas.appendChild(text);
      }
    });

    if (edgeDrag) {
      const preview = document.createElementNS(svgNS, "line");
      preview.setAttribute("x1", String(edgeDrag.start.x));
      preview.setAttribute("y1", String(edgeDrag.start.y));
      preview.setAttribute("x2", String(edgeDrag.current.x));
      preview.setAttribute("y2", String(edgeDrag.current.y));
      preview.setAttribute("stroke", edgeDrag.targetId ? "#2563eb" : "#94a3b8");
      preview.setAttribute("stroke-width", "2");
      preview.setAttribute("stroke-dasharray", "6 6");
      preview.setAttribute("marker-end", "url(#edge-arrow)");
      canvas.appendChild(preview);
    }

    if (selectionRect) {
      const rect = document.createElementNS(svgNS, "rect");
      const minX = Math.min(selectionRect.start.x, selectionRect.current.x);
      const minY = Math.min(selectionRect.start.y, selectionRect.current.y);
      const width = Math.abs(selectionRect.start.x - selectionRect.current.x);
      const height = Math.abs(selectionRect.start.y - selectionRect.current.y);
      rect.setAttribute("x", String(minX));
      rect.setAttribute("y", String(minY));
      rect.setAttribute("width", String(width));
      rect.setAttribute("height", String(height));
      rect.classList.add("selection-rect");
      canvas.appendChild(rect);
    }

    diagram.flowchart.nodes.forEach((node) => {
      const group = document.createElementNS(svgNS, "g");
      group.classList.add("canvas-node");
      if (selectedNodeIds.has(node.id)) {
        group.classList.add("selected");
      }
      if (edgeDrag && edgeDrag.targetId === node.id) {
        group.classList.add("edge-target");
      }
      group.dataset.id = String(node.id);

      if (node.shape === "decision") {
        const diamond = document.createElementNS(svgNS, "polygon");
        const points = [
          [node.x, node.y - node.height / 2],
          [node.x + node.width / 2, node.y],
          [node.x, node.y + node.height / 2],
          [node.x - node.width / 2, node.y]
        ]
          .map((pair) => pair.join(","))
          .join(" ");
        diamond.setAttribute("points", points);
        diamond.setAttribute("fill", node.fill);
        diamond.setAttribute("stroke", node.stroke);
        diamond.setAttribute("stroke-width", "2");
        group.appendChild(diamond);
      } else {
        const rect = document.createElementNS(svgNS, "rect");
        rect.setAttribute("x", String(node.x - node.width / 2));
        rect.setAttribute("y", String(node.y - node.height / 2));
        rect.setAttribute("width", String(node.width));
        rect.setAttribute("height", String(node.height));
        rect.setAttribute("fill", node.fill);
        rect.setAttribute("stroke", node.stroke);
        rect.setAttribute("stroke-width", "2");
        if (node.shape === "terminator") {
          rect.setAttribute("rx", String(node.height / 2));
          rect.setAttribute("ry", String(node.height / 2));
        } else {
          rect.setAttribute("rx", "8");
          rect.setAttribute("ry", "8");
        }
        group.appendChild(rect);
      }

      const text = document.createElementNS(svgNS, "text");
      text.setAttribute("x", String(node.x));
      text.setAttribute("y", String(node.y + 4));
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("fill", node.textColor);
      text.setAttribute("font-size", "14");
      text.textContent = node.label;
      group.appendChild(text);

      const handleOffset = 8;
      const handleRadius = 5;
      const handles = [
        {
          side: "left",
          x: node.x - node.width / 2 - handleOffset,
          y: node.y
        },
        {
          side: "right",
          x: node.x + node.width / 2 + handleOffset,
          y: node.y
        },
        {
          side: "top",
          x: node.x,
          y: node.y - node.height / 2 - handleOffset
        },
        {
          side: "bottom",
          x: node.x,
          y: node.y + node.height / 2 + handleOffset
        }
      ];

      handles.forEach((handle) => {
        const circle = document.createElementNS(svgNS, "circle");
        circle.classList.add("edge-handle");
        circle.dataset.id = String(node.id);
        circle.dataset.side = handle.side;
        circle.dataset.x = String(handle.x);
        circle.dataset.y = String(handle.y);
        circle.setAttribute("cx", String(handle.x));
        circle.setAttribute("cy", String(handle.y));
        circle.setAttribute("r", String(handleRadius));
        group.appendChild(circle);
      });

      canvas.appendChild(group);
    });
  }

  function renderSequence() {
    canvas.innerHTML = "";
    applyViewBox();

    const defs = document.createElementNS(svgNS, "defs");
    const marker = document.createElementNS(svgNS, "marker");
    marker.setAttribute("id", "seq-arrow");
    marker.setAttribute("viewBox", "0 0 10 10");
    marker.setAttribute("refX", "8");
    marker.setAttribute("refY", "5");
    marker.setAttribute("markerWidth", "8");
    marker.setAttribute("markerHeight", "8");
    marker.setAttribute("orient", "auto-start-reverse");
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
    path.setAttribute("fill", "#1f2937");
    marker.appendChild(path);
    defs.appendChild(marker);
    canvas.appendChild(defs);

    const participants = diagram.sequence.participants;
    const positions = new Map();
    const width = 1200;
    const xPadding = 120;
    const yTop = 80;
    const yBottom = 760;
    const spacing = participants.length > 1
      ? (width - xPadding * 2) / (participants.length - 1)
      : 0;

    participants.forEach((participant, index) => {
      const x = xPadding + spacing * index;
      positions.set(participant.id, x);

      const group = document.createElementNS(svgNS, "g");
      group.classList.add("sequence-participant");
      group.dataset.id = String(participant.id);

      const rect = document.createElementNS(svgNS, "rect");
      rect.setAttribute("x", String(x - 60));
      rect.setAttribute("y", String(yTop - 30));
      rect.setAttribute("width", "120");
      rect.setAttribute("height", "36");
      rect.setAttribute("rx", "8");
      rect.setAttribute("fill", participant.id === selectedParticipantId ? "#dbeafe" : "#e5e7eb");
      rect.setAttribute("stroke", "#1f2937");
      rect.setAttribute("stroke-width", "1.5");
      group.appendChild(rect);

      const text = document.createElementNS(svgNS, "text");
      text.setAttribute("x", String(x));
      text.setAttribute("y", String(yTop - 8));
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("fill", "#111827");
      text.setAttribute("font-size", "13");
      text.textContent = participant.name;
      group.appendChild(text);

      const line = document.createElementNS(svgNS, "line");
      line.setAttribute("x1", String(x));
      line.setAttribute("y1", String(yTop + 6));
      line.setAttribute("x2", String(x));
      line.setAttribute("y2", String(yBottom));
      line.setAttribute("stroke", "#9ca3af");
      line.setAttribute("stroke-dasharray", "6 6");
      group.appendChild(line);

      canvas.appendChild(group);
    });

    diagram.sequence.messages.forEach((message, index) => {
      const fromX = positions.get(message.from);
      const toX = positions.get(message.to);
      if (fromX === undefined || toX === undefined) return;
      const y = yTop + 80 + index * 60;
      const line = document.createElementNS(svgNS, "line");
      line.classList.add("sequence-message");
      line.dataset.id = String(message.id);
      line.setAttribute("x1", String(fromX));
      line.setAttribute("y1", String(y));
      line.setAttribute("x2", String(toX));
      line.setAttribute("y2", String(y));
      line.setAttribute("stroke", "#1f2937");
      line.setAttribute("stroke-width", message.id === selectedMessageId ? "3" : "2");
      if (message.line === "dashed") {
        line.setAttribute("stroke-dasharray", "6 6");
      }
      line.setAttribute("marker-end", "url(#seq-arrow)");
      canvas.appendChild(line);

      const label = document.createElementNS(svgNS, "text");
      label.classList.add("sequence-message");
      label.dataset.id = String(message.id);
      label.setAttribute("x", String((fromX + toX) / 2));
      label.setAttribute("y", String(y - 8));
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("fill", "#111827");
      label.setAttribute("font-size", "12");
      label.textContent = message.label;
      canvas.appendChild(label);
    });
  }

  function renderPie() {
    canvas.innerHTML = "";
    applyViewBox();
    if (!diagram || diagram.type !== "pie") return;

    const total = diagram.pie.slices.reduce((sum, slice) => sum + slice.value, 0) || 1;
    const centerX = 600;
    const centerY = 380;
    const radius = 220;
    let currentAngle = -Math.PI / 2;

    const title = document.createElementNS(svgNS, "text");
    title.setAttribute("x", String(centerX));
    title.setAttribute("y", "80");
    title.setAttribute("text-anchor", "middle");
    title.setAttribute("fill", "#111827");
    title.setAttribute("font-size", "20");
    title.textContent = diagram.pie.title || "Pie Chart";
    canvas.appendChild(title);

    diagram.pie.slices.forEach((slice) => {
      const angle = (slice.value / total) * Math.PI * 2;
      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;
      const largeArc = angle > Math.PI ? 1 : 0;
      const start = polarPoint(centerX, centerY, radius, startAngle);
      const end = polarPoint(centerX, centerY, radius, endAngle);
      const path = document.createElementNS(svgNS, "path");
      const d = [
        `M ${centerX} ${centerY}`,
        `L ${start.x} ${start.y}`,
        `A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`,
        "Z"
      ].join(" ");
      path.setAttribute("d", d);
      path.setAttribute("fill", slice.color || "#60a5fa");
      path.setAttribute("stroke", "#ffffff");
      path.setAttribute("stroke-width", "2");
      canvas.appendChild(path);

      const labelAngle = startAngle + angle / 2;
      const labelPoint = polarPoint(centerX, centerY, radius + 24, labelAngle);
      const label = document.createElementNS(svgNS, "text");
      label.setAttribute("x", String(labelPoint.x));
      label.setAttribute("y", String(labelPoint.y));
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("fill", "#1f2937");
      label.setAttribute("font-size", "12");
      label.textContent = `${slice.label} (${slice.value})`;
      canvas.appendChild(label);

      currentAngle = endAngle;
    });
  }

  function renderGantt() {
    canvas.innerHTML = "";
    applyViewBox();
    if (!diagram || diagram.type !== "gantt") return;

    const title = document.createElementNS(svgNS, "text");
    title.setAttribute("x", "600");
    title.setAttribute("y", "70");
    title.setAttribute("text-anchor", "middle");
    title.setAttribute("fill", "#111827");
    title.setAttribute("font-size", "20");
    title.textContent = diagram.gantt.title || "Gantt Chart";
    canvas.appendChild(title);

    const tasks = diagram.gantt.tasks;
    const dates = tasks
      .flatMap((task) => [parseDate(task.start), parseDate(task.end)])
      .filter((value) => value !== null);
    const minDate = dates.length ? Math.min(...dates) : Date.now();
    const maxDate = dates.length ? Math.max(...dates) : Date.now() + 86400000;
    const range = Math.max(1, maxDate - minDate);

    const startX = 160;
    const width = 900;
    let y = 120;
    let currentSection = "";

    tasks.forEach((task) => {
      if (task.section !== currentSection) {
        currentSection = task.section;
        const sectionLabel = document.createElementNS(svgNS, "text");
        sectionLabel.setAttribute("x", "80");
        sectionLabel.setAttribute("y", String(y));
        sectionLabel.setAttribute("text-anchor", "start");
        sectionLabel.setAttribute("fill", "#374151");
        sectionLabel.setAttribute("font-size", "12");
        sectionLabel.textContent = currentSection || "Section";
        canvas.appendChild(sectionLabel);
        y += 20;
      }

      const start = parseDate(task.start) ?? minDate;
      const end = parseDate(task.end) ?? start + 86400000;
      const barStart = startX + ((start - minDate) / range) * width;
      const barEnd = startX + ((end - minDate) / range) * width;
      const barWidth = Math.max(6, barEnd - barStart);

      const bar = document.createElementNS(svgNS, "rect");
      bar.setAttribute("x", String(barStart));
      bar.setAttribute("y", String(y));
      bar.setAttribute("width", String(barWidth));
      bar.setAttribute("height", "20");
      bar.setAttribute("rx", "6");
      bar.setAttribute("fill", statusColor(task.status));
      canvas.appendChild(bar);

      const label = document.createElementNS(svgNS, "text");
      label.setAttribute("x", String(barStart + 6));
      label.setAttribute("y", String(y + 14));
      label.setAttribute("fill", "#0f172a");
      label.setAttribute("font-size", "11");
      label.textContent = task.label;
      canvas.appendChild(label);

      y += 30;
    });
  }

  function renderJourney() {
    canvas.innerHTML = "";
    applyViewBox();
    if (!diagram || diagram.type !== "journey") return;

    const title = document.createElementNS(svgNS, "text");
    title.setAttribute("x", "600");
    title.setAttribute("y", "70");
    title.setAttribute("text-anchor", "middle");
    title.setAttribute("fill", "#111827");
    title.setAttribute("font-size", "20");
    title.textContent = diagram.journey.title || "User Journey";
    canvas.appendChild(title);

    const steps = diagram.journey.steps;
    const sections = [];
    steps.forEach((step) => {
      if (!sections.includes(step.section)) {
        sections.push(step.section);
      }
    });

    const columnWidth = sections.length ? 1000 / sections.length : 1000;
    const startX = 100;
    const startY = 120;
    const boxHeight = 40;

    sections.forEach((section, index) => {
      const x = startX + index * columnWidth;
      const header = document.createElementNS(svgNS, "text");
      header.setAttribute("x", String(x + columnWidth / 2));
      header.setAttribute("y", String(startY));
      header.setAttribute("text-anchor", "middle");
      header.setAttribute("fill", "#374151");
      header.setAttribute("font-size", "12");
      header.textContent = section || "Stage";
      canvas.appendChild(header);

      const sectionSteps = steps.filter((step) => step.section === section);
      sectionSteps.forEach((step, stepIndex) => {
        const y = startY + 20 + stepIndex * (boxHeight + 12);
        const rect = document.createElementNS(svgNS, "rect");
        rect.setAttribute("x", String(x + 10));
        rect.setAttribute("y", String(y));
        rect.setAttribute("width", String(columnWidth - 20));
        rect.setAttribute("height", String(boxHeight));
        rect.setAttribute("rx", "8");
        rect.setAttribute("fill", scoreColor(step.score));
        canvas.appendChild(rect);

        const label = document.createElementNS(svgNS, "text");
        label.setAttribute("x", String(x + columnWidth / 2));
        label.setAttribute("y", String(y + 24));
        label.setAttribute("text-anchor", "middle");
        label.setAttribute("fill", "#0f172a");
        label.setAttribute("font-size", "11");
        label.textContent = `${step.task} (${step.score})`;
        canvas.appendChild(label);
      });
    });
  }

  function setSelectedNodes(ids) {
    selectedNodeIds = new Set(ids);
    selectedNodeId = ids.length ? ids[ids.length - 1] : null;
  }

  function getSelectedNodes() {
    if (!diagram || diagram.type !== "flowchart") return [];
    return diagram.flowchart.nodes.filter((node) => selectedNodeIds.has(node.id));
  }

  function getSelectedNode() {
    if (!diagram || selectedNodeId === null) return null;
    return diagram.flowchart.nodes.find((node) => node.id === selectedNodeId) || null;
  }

  function getSelectedEdge() {
    if (!diagram || selectedEdgeId === null) return null;
    return diagram.flowchart.edges.find((edge) => edge.id === selectedEdgeId) || null;
  }

  function getSelectedParticipant() {
    if (!diagram || selectedParticipantId === null) return null;
    return (
      diagram.sequence.participants.find((participant) => participant.id === selectedParticipantId) ||
      null
    );
  }

  function getSelectedMessage() {
    if (!diagram || selectedMessageId === null) return null;
    return (
      diagram.sequence.messages.find((message) => message.id === selectedMessageId) || null
    );
  }

  function allocateId() {
    if (!diagram) return 1;
    const maxId = computeMaxId();
    if (!diagram.nextId || diagram.nextId <= maxId) {
      diagram.nextId = maxId + 1;
    }
    const id = diagram.nextId;
    diagram.nextId += 1;
    return id;
  }

  function computeMaxId() {
    const maxNode = diagram.flowchart.nodes.reduce((max, node) => Math.max(max, node.id), 0);
    const maxEdge = diagram.flowchart.edges.reduce((max, edge) => Math.max(max, edge.id), 0);
    const maxParticipant = diagram.sequence.participants.reduce(
      (max, participant) => Math.max(max, participant.id),
      0
    );
    const maxMessage = diagram.sequence.messages.reduce(
      (max, message) => Math.max(max, message.id),
      0
    );
    const maxPie = diagram.pie.slices.reduce((max, slice) => Math.max(max, slice.id), 0);
    const maxGantt = diagram.gantt.tasks.reduce((max, task) => Math.max(max, task.id), 0);
    const maxJourney = diagram.journey.steps.reduce((max, step) => Math.max(max, step.id), 0);
    return Math.max(
      maxNode,
      maxEdge,
      maxParticipant,
      maxMessage,
      maxPie,
      maxGantt,
      maxJourney
    );
  }

  function normalizeDiagram(raw) {
    if (!raw) {
      return {
        version: 2,
        type: "flowchart",
        flowchart: { nodes: [], edges: [] },
        sequence: { participants: [], messages: [] },
        pie: { title: "", slices: [] },
        gantt: { title: "", dateFormat: "YYYY-MM-DD", tasks: [] },
        journey: { title: "", steps: [] },
        nextId: 1
      };
    }
    if (!raw.flowchart && (raw.nodes || raw.edges)) {
      raw.flowchart = { nodes: raw.nodes || [], edges: raw.edges || [] };
    }
    if (!raw.sequence) {
      raw.sequence = { participants: [], messages: [] };
    }
    if (!raw.pie) {
      raw.pie = { title: "", slices: [] };
    }
    if (!raw.gantt) {
      raw.gantt = { title: "", dateFormat: "YYYY-MM-DD", tasks: [] };
    }
    if (!raw.journey) {
      raw.journey = { title: "", steps: [] };
    }
    if (!Array.isArray(raw.flowchart?.nodes)) raw.flowchart.nodes = [];
    if (!Array.isArray(raw.flowchart?.edges)) raw.flowchart.edges = [];
    if (!Array.isArray(raw.sequence?.participants)) raw.sequence.participants = [];
    if (!Array.isArray(raw.sequence?.messages)) raw.sequence.messages = [];
    if (!Array.isArray(raw.pie?.slices)) raw.pie.slices = [];
    if (!Array.isArray(raw.gantt?.tasks)) raw.gantt.tasks = [];
    if (!Array.isArray(raw.journey?.steps)) raw.journey.steps = [];
    if (
      raw.type !== "flowchart" &&
      raw.type !== "sequence" &&
      raw.type !== "pie" &&
      raw.type !== "gantt" &&
      raw.type !== "journey"
    ) {
      raw.type = "flowchart";
    }
    const maxId = computeMaxIdFromRaw(raw);
    if (!raw.nextId || raw.nextId <= maxId) {
      raw.nextId = maxId + 1;
    }
    return raw;
  }

  function computeMaxIdFromRaw(raw) {
    const maxNode = (raw.flowchart?.nodes || []).reduce(
      (max, node) => Math.max(max, Number(node.id) || 0),
      0
    );
    const maxEdge = (raw.flowchart?.edges || []).reduce(
      (max, edge) => Math.max(max, Number(edge.id) || 0),
      0
    );
    const maxParticipant = (raw.sequence?.participants || []).reduce(
      (max, participant) => Math.max(max, Number(participant.id) || 0),
      0
    );
    const maxMessage = (raw.sequence?.messages || []).reduce(
      (max, message) => Math.max(max, Number(message.id) || 0),
      0
    );
    const maxPie = (raw.pie?.slices || []).reduce(
      (max, slice) => Math.max(max, Number(slice.id) || 0),
      0
    );
    const maxGantt = (raw.gantt?.tasks || []).reduce(
      (max, task) => Math.max(max, Number(task.id) || 0),
      0
    );
    const maxJourney = (raw.journey?.steps || []).reduce(
      (max, step) => Math.max(max, Number(step.id) || 0),
      0
    );
    return Math.max(maxNode, maxEdge, maxParticipant, maxMessage, maxPie, maxGantt, maxJourney);
  }

  function clientToSvgPoint(event, inverseOverride) {
    if (!canvas) return null;
    const ctm = inverseOverride ?? canvas.getScreenCTM();
    if (!ctm) return null;
    const point = canvas.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const inverse = inverseOverride ?? ctm.inverse();
    return point.matrixTransform(inverse);
  }

  function getFlowchartNodeAtPoint(point) {
    if (!diagram || diagram.type !== "flowchart") return null;
    for (let i = diagram.flowchart.nodes.length - 1; i >= 0; i -= 1) {
      const node = diagram.flowchart.nodes[i];
      if (isPointInNode(point, node)) {
        return node.id;
      }
    }
    return null;
  }

  function getNodesInRect(start, current) {
    if (!diagram || diagram.type !== "flowchart") return [];
    const minX = Math.min(start.x, current.x);
    const maxX = Math.max(start.x, current.x);
    const minY = Math.min(start.y, current.y);
    const maxY = Math.max(start.y, current.y);
    const selected = [];
    diagram.flowchart.nodes.forEach((node) => {
      const bounds = getNodeBounds(node);
      if (
        bounds.minX <= maxX &&
        bounds.maxX >= minX &&
        bounds.minY <= maxY &&
        bounds.maxY >= minY
      ) {
        selected.push(node.id);
      }
    });
    return selected;
  }

  function isPointInNode(point, node) {
    const dx = point.x - node.x;
    const dy = point.y - node.y;
    const halfW = node.width / 2;
    const halfH = node.height / 2;
    if (node.shape === "decision") {
      return (Math.abs(dx) / halfW + Math.abs(dy) / halfH) <= 1;
    }
    return Math.abs(dx) <= halfW && Math.abs(dy) <= halfH;
  }

  function getNodeBounds(node) {
    const halfW = node.width / 2;
    const halfH = node.height / 2;
    return {
      minX: node.x - halfW,
      maxX: node.x + halfW,
      minY: node.y - halfH,
      maxY: node.y + halfH
    };
  }

  function getEdgeEndpoints(from, to, arrow) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.hypot(dx, dy) || 1;
    const start = getNodeBoundaryPoint(from, to);
    const end = getNodeBoundaryPoint(to, from);
    const maxPad = Math.max(0, distance / 2 - 1);
    const pad = Math.min(8, maxPad);
    if (arrow === "double") {
      return {
        start: offsetPoint(start, dx, dy, pad),
        end: offsetPoint(end, dx, dy, -pad)
      };
    }
    if (arrow !== "none") {
      return { start, end: offsetPoint(end, dx, dy, -pad) };
    }
    return { start, end };
  }

  function getNodeBoundaryPoint(node, target) {
    const dx = target.x - node.x;
    const dy = target.y - node.y;
    if (!dx && !dy) {
      return { x: node.x, y: node.y };
    }
    const halfW = node.width / 2;
    const halfH = node.height / 2;
    if (node.shape === "decision") {
      const denom = Math.abs(dx) / halfW + Math.abs(dy) / halfH;
      const scale = denom ? 1 / denom : 0;
      return { x: node.x + dx * scale, y: node.y + dy * scale };
    }
    const scale = Math.min(
      halfW / Math.max(1e-6, Math.abs(dx)),
      halfH / Math.max(1e-6, Math.abs(dy))
    );
    return { x: node.x + dx * scale, y: node.y + dy * scale };
  }

  function offsetPoint(point, dx, dy, amount) {
    const distance = Math.hypot(dx, dy);
    if (!distance) return point;
    const scale = amount / distance;
    return { x: point.x + dx * scale, y: point.y + dy * scale };
  }

  function polarPoint(cx, cy, radius, angle) {
    return {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius
    };
  }

  function parseDate(value) {
    if (!value) return null;
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? null : timestamp;
  }

  function statusColor(status) {
    switch (status) {
      case "done":
        return "#34d399";
      case "active":
        return "#60a5fa";
      case "crit":
        return "#f87171";
      default:
        return "#cbd5f5";
    }
  }

  function scoreColor(score) {
    const normalized = clamp(score, 1, 5);
    const palette = {
      1: "#fecaca",
      2: "#fed7aa",
      3: "#fde68a",
      4: "#bbf7d0",
      5: "#86efac"
    };
    return palette[normalized] || "#e2e8f0";
  }

  function applyViewBox() {
    canvas.setAttribute(
      "viewBox",
      `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`
    );
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function pickSliceColor(index) {
    const palette = [
      "#60a5fa",
      "#34d399",
      "#fbbf24",
      "#f87171",
      "#a78bfa",
      "#fb7185",
      "#38bdf8",
      "#22c55e"
    ];
    return palette[index % palette.length];
  }

  function isEditingTarget(target) {
    if (!target || !target.tagName) return false;
    const tag = target.tagName.toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") {
      return true;
    }
    return !!target.isContentEditable;
  }

  function findAncestorWithClass(target, className) {
    let node = target;
    while (node) {
      if (node.classList && node.classList.contains(className)) {
        return node;
      }
      node = node.parentNode;
    }
    return null;
  }

  vscode.postMessage({ type: "ready" });
})();
