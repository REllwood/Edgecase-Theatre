import {
  allFixtures,
  exportSelectedScene,
  isolateRender,
  planMatrix
} from "/src/case-engine.js";

const elements = {
  form: document.querySelector("#matrix-form"),
  fixtures: document.querySelector("#fixture-list"),
  viewport: document.querySelector("#viewport"),
  theme: document.querySelector("#theme"),
  direction: document.querySelector("#direction"),
  estimate: document.querySelector("#cost-estimate"),
  render: document.querySelector("#render-button"),
  cancel: document.querySelector("#cancel-button"),
  progress: document.querySelector("#progress"),
  sceneSummary: document.querySelector("#scene-summary"),
  frames: document.querySelector("#frame-list"),
  warningsOnly: document.querySelector("#warnings-only"),
  export: document.querySelector("#export-button"),
  exportArea: document.querySelector("#fixture-export")
};

let scene;
let fixtures = [];
let controller;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function nextPaint() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function setProgress(label, loading = false) {
  elements.progress.dataset.loading = String(loading);
  elements.progress.textContent = loading ? `Loading: ${label}` : label;
}

async function withLoading(label, operation) {
  setProgress(label, true);
  await nextPaint();
  try {
    return await operation();
  } catch (error) {
    setProgress(
      `Could not complete the action: ${error instanceof Error ? error.message : String(error)}`,
      false
    );
    throw error;
  }
}

function selectedIds() {
  return [...elements.fixtures.querySelectorAll("input:checked")].map((input) => input.value);
}

function selectedDimensions() {
  const viewports =
    elements.viewport.value === "both"
      ? [{ name: "compact", width: 280 }, { name: "wide", width: 480 }]
      : elements.viewport.value === "compact"
        ? [{ name: "compact", width: 280 }]
        : [{ name: "wide", width: 480 }];
  const themes = elements.theme.value === "both" ? ["light", "dark"] : [elements.theme.value];
  const directions =
    elements.direction.value === "both" ? ["ltr", "rtl"] : [elements.direction.value];
  return { viewports, themes, directions };
}

function updateEstimate() {
  const count =
    selectedIds().length *
    selectedDimensions().viewports.length *
    selectedDimensions().themes.length *
    selectedDimensions().directions.length;
  elements.estimate.textContent =
    count === 0
      ? "Select at least one fixture."
      : `${count} frame${count === 1 ? "" : "s"} will be rendered progressively.`;
}

function renderFixtureControls() {
  elements.fixtures.replaceChildren(
    ...fixtures.map((fixture, index) => {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = fixture.id;
      input.checked = index < 6;
      input.addEventListener("change", updateEstimate);
      const copy = document.createElement("span");
      const title = document.createElement("strong");
      title.textContent = fixture.name;
      const source = document.createElement("small");
      source.textContent = fixture.trace
        ? `${fixture.trace.rule} · seed ${fixture.trace.seed}`
        : fixture.source;
      copy.append(title, source);
      label.append(input, copy);
      return label;
    })
  );
  updateEstimate();
}

function componentMarkup(props, frame) {
  if (props.status === "Force render exception") {
    throw new Error("Demonstration component rejected the status prop");
  }
  const theme = frame.theme === "dark"
    ? { background: "#17201f", foreground: "#f1f3ed", muted: "#b8c1bd", line: "#55615d" }
    : { background: "#f8f7f0", foreground: "#182220", muted: "#59635f", line: "#9da6a1" };
  const logo = props.logoUrl
    ? `<img src="${escapeHtml(props.logoUrl)}" alt="${escapeHtml(props.airline)} logo">`
    : `<span class="logo-fallback" role="img" aria-label="Airline logo unavailable">Logo unavailable</span>`;
  const updates = Array.isArray(props.updates)
    ? props.updates.map((update) => `<li>${escapeHtml(update)}</li>`).join("")
    : "";
  return `<!doctype html>
<html lang="en-AU" dir="${escapeHtml(frame.direction)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width">
<style>
*{box-sizing:border-box}body{margin:0;padding:12px;background:${theme.background};color:${theme.foreground};font-family:system-ui,sans-serif}
article{border:1px solid ${theme.line};padding:14px;min-height:220px;overflow-wrap:anywhere}
header{align-items:center;display:flex;gap:10px;border-bottom:1px solid ${theme.line};padding-bottom:10px}
img,.logo-fallback{display:grid;height:42px;min-width:42px;place-items:center;width:42px}.logo-fallback{border:1px dashed ${theme.line};font-size:8px;text-align:center}
h1{font-size:15px;margin:0}.route{font-family:Georgia,serif;font-size:23px;line-height:1.05;margin:18px 0 6px}.route span{display:block}
.status{font-weight:700;margin:0}.meta{color:${theme.muted};font-size:12px;margin:10px 0 0;padding:0;list-style:none}
</style>
</head>
<body>
<article aria-label="Flight status">
<header>${logo}<h1>${escapeHtml(props.airline ?? "Unnamed airline")}</h1></header>
<p class="route"><span>${escapeHtml(props.origin ?? "Origin missing")}</span><span>${escapeHtml(props.destination ?? "Destination missing")}</span></p>
<p class="status">${escapeHtml(props.status ?? "Status unavailable")}</p>
<p>${escapeHtml(props.gate ?? "Gate not assigned")} · ${escapeHtml(props.delayMinutes ?? "—")} min delay</p>
<ul class="meta">${updates}</ul>
</article>
</body>
</html>`;
}

function addFinding(frameElement, finding) {
  frameElement.dataset.finding = "true";
  const item = document.createElement("li");
  item.textContent = `${finding.rule}: ${finding.evidence} ${finding.nextAction}`;
  frameElement.querySelector(".findings").append(item);
}

function waitForFrameLoad(iframe, signal, timeoutMs = 3_000) {
  return new Promise((resolve, reject) => {
    let timer;
    const cleanup = () => {
      clearTimeout(timer);
      iframe.removeEventListener("load", onLoad);
      signal.removeEventListener("abort", onAbort);
    };
    const onLoad = () => {
      cleanup();
      resolve();
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException("Matrix rendering was cancelled", "AbortError"));
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    iframe.addEventListener("load", onLoad, { once: true });
    signal.addEventListener("abort", onAbort, { once: true });
    timer = setTimeout(() => {
      cleanup();
      reject(new Error(`The isolated frame did not load within ${timeoutMs} ms`));
    }, timeoutMs);
  });
}

async function createFrame(frame, signal) {
  const article = document.createElement("article");
  article.className = "frame";
  article.dataset.finding = "false";
  const heading = document.createElement("header");
  const title = document.createElement("h3");
  title.textContent = frame.fixture.name;
  const metadata = document.createElement("p");
  metadata.textContent = `${frame.viewport.width} px · ${frame.theme} · ${frame.direction}`;
  heading.append(title, metadata);
  const findings = document.createElement("ul");
  findings.className = "findings";
  findings.setAttribute("aria-label", "Automated findings");
  article.append(heading);

  const isolated = isolateRender(frame, componentMarkup);
  if (!isolated.ok) {
    const failure = document.createElement("p");
    failure.className = "frame-failure";
    failure.textContent = `Render contained: ${isolated.finding.evidence}`;
    article.append(failure, findings);
    addFinding(article, isolated.finding);
    elements.frames.append(article);
    return article;
  }

  const iframe = document.createElement("iframe");
  iframe.title = `${frame.fixture.name}, ${frame.viewport.name} viewport`;
  iframe.width = String(frame.viewport.width);
  iframe.height = "250";
  iframe.sandbox = "allow-same-origin";
  iframe.srcdoc = isolated.value;
  const frameLoaded = waitForFrameLoad(iframe, signal);
  article.append(iframe, findings);
  elements.frames.append(article);
  try {
    await frameLoaded;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    addFinding(article, {
      rule: "frame-load-timeout",
      evidence: error instanceof Error ? error.message : String(error),
      nextAction: "Retry this frame in a current browser; the remaining matrix stays bounded."
    });
    return article;
  }

  const documentRoot = iframe.contentDocument?.documentElement;
  if (!documentRoot) {
    addFinding(article, {
      rule: "frame-unavailable",
      evidence: "The isolated document could not be inspected.",
      nextAction: "Retry this frame in a current browser."
    });
  } else {
    if (documentRoot.scrollWidth > documentRoot.clientWidth) {
      addFinding(article, {
        rule: "horizontal-overflow",
        evidence: `${documentRoot.scrollWidth}px content exceeds ${documentRoot.clientWidth}px viewport.`,
        nextAction: "Inspect wrapping and minimum-width rules."
      });
    }
    const imagesWithoutAlt = [...documentRoot.querySelectorAll("img")].filter(
      (image) => !image.hasAttribute("alt")
    );
    if (imagesWithoutAlt.length > 0) {
      addFinding(article, {
        rule: "image-text",
        evidence: `${imagesWithoutAlt.length} image lacks alternative text.`,
        nextAction: "Provide a useful alt value or mark decoration explicitly."
      });
    }
  }
  return article;
}

async function loadScene() {
  try {
    await withLoading("Reading the demonstration scene", async () => {
      const response = await fetch("/examples/flight-status.scene.json");
      if (!response.ok) {
        throw new Error(`Scene request returned ${response.status}`);
      }
      scene = await response.json();
      fixtures = allFixtures(scene);
      renderFixtureControls();
      elements.sceneSummary.textContent = `${fixtures.length} named fixtures ready`;
    });
    setProgress("Scene ready. Select fixtures and render the matrix.", false);
  } catch {
    elements.sceneSummary.textContent = "Scene unavailable";
    elements.fixtures.textContent = "The scene could not be loaded. Reload the page to retry.";
  }
}

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!scene) {
    setProgress("The scene is unavailable. Reload the page to retry.", false);
    return;
  }
  controller?.abort();
  controller = new AbortController();
  const activeController = controller;
  elements.render.disabled = true;
  elements.cancel.disabled = false;
  elements.frames.replaceChildren();
  try {
    const frames = planMatrix(scene, selectedIds(), selectedDimensions());
    await withLoading(`Rendering frame 0 of ${frames.length}`, async () => {
      for (const [index, frame] of frames.entries()) {
        if (activeController.signal.aborted) {
          throw new DOMException("Matrix rendering was cancelled", "AbortError");
        }
        setProgress(`Rendering frame ${index + 1} of ${frames.length}`, true);
        await createFrame(frame, activeController.signal);
        await nextPaint();
      }
    });
    setProgress(`Rendered ${frames.length} of ${frames.length} frames.`, false);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      setProgress("Rendering cancelled. Completed frames remain available for review.", false);
    }
  } finally {
    if (controller === activeController) {
      controller = undefined;
      elements.render.disabled = false;
      elements.cancel.disabled = true;
    }
  }
});

elements.cancel.addEventListener("click", () => controller?.abort());

elements.export.addEventListener("click", async () => {
  elements.export.disabled = true;
  try {
    await withLoading("Preparing selected fixture export", async () => {
      await nextPaint();
      elements.exportArea.value = JSON.stringify(exportSelectedScene(scene, selectedIds()), null, 2);
    });
    setProgress("Selected fixtures are ready in the export field.", false);
  } catch {
    // withLoading has supplied a recoverable message.
  } finally {
    elements.export.disabled = false;
  }
});

elements.warningsOnly.addEventListener("change", () => {
  for (const frame of elements.frames.querySelectorAll(".frame")) {
    frame.hidden = elements.warningsOnly.checked && frame.dataset.finding !== "true";
  }
});

for (const control of [elements.viewport, elements.theme, elements.direction]) {
  control.addEventListener("change", updateEstimate);
}

await loadScene();
