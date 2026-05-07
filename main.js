const options = {
  expectedInputs: [{ type: "text", languages: ["en"] }],
  expectedOutputs: [{ type: "text", languages: ["en"] }],
};

let session = null;
let activePromptController = null;
let rawOutput = "Create a session, then send a prompt.";

const checkButton = document.querySelector("#checkButton");
const createButton = document.querySelector("#createButton");
const destroyButton = document.querySelector("#destroyButton");
const promptForm = document.querySelector("#promptForm");
const promptInput = document.querySelector("#promptInput");
const promptButton = document.querySelector("#promptButton");
const streamButton = document.querySelector("#streamButton");
const stopButton = document.querySelector("#stopButton");
const statusEl = document.querySelector("#status");
const outputEl = document.querySelector("#output");
const errorEl = document.querySelector("#error");
const usageEl = document.querySelector("#usage");
const downloadWrap = document.querySelector("#downloadWrap");
const downloadText = document.querySelector("#downloadText");
const downloadProgress = document.querySelector("#downloadProgress");

checkButton.addEventListener("click", checkAvailability);
createButton.addEventListener("click", createSession);
destroyButton.addEventListener("click", destroySession);
promptForm.addEventListener("submit", (event) => {
  event.preventDefault();
  runPrompt({ streaming: false });
});
streamButton.addEventListener("click", () => runPrompt({ streaming: true }));
stopButton.addEventListener("click", stopActivePrompt);

setStatus("Ready to check");

async function checkAvailability() {
  clearError();

  if (!("LanguageModel" in globalThis)) {
    setStatus("API unavailable");
    setOutput(
      "LanguageModel is not exposed in this browser. Use Chrome with the built-in AI flags enabled, then load this page from localhost."
    );
    return;
  }

  try {
    setStatus("Checking...");
    const availability = await LanguageModel.availability(options);
    setStatus(`Availability: ${availability}`);
    createButton.disabled = availability === "unavailable";

    if (availability === "downloadable") {
      setOutput("The model is available to download. Click Create session to start the download.");
    } else if (availability === "downloading") {
      setOutput("The model is already downloading. Click Create session to observe progress.");
    } else if (availability === "available") {
      setOutput("The model is ready. Click Create session.");
    } else {
      setOutput("This device or browser profile cannot currently run the selected Prompt API options.");
    }
  } catch (error) {
    showError(error);
    setStatus("Check failed");
  }
}

async function createSession() {
  clearError();
  createButton.disabled = true;
  checkButton.disabled = true;
  downloadWrap.hidden = true;

  try {
    setStatus("Creating session...");
    session = await LanguageModel.create({
      ...options,
      initialPrompts: [
        {
          role: "system",
          content:
            "You are a concise assistant for web developers. Prefer practical examples and short explanations.",
        },
      ],
      monitor(monitor) {
        downloadWrap.hidden = false;
        monitor.addEventListener("downloadprogress", (event) => {
          const percentage = Math.round(event.loaded * 100);
          downloadProgress.value = percentage;
          downloadText.textContent = `${percentage}%`;
          setStatus(`Downloading model: ${percentage}%`);
        });
      },
    });

    session.addEventListener("contextoverflow", () => {
      setOutput(`${rawOutput}\n\nContext overflow: older conversation turns were dropped.`);
      updateUsage();
    });

    setStatus("Session ready");
    setOutput("Session created. Send a prompt or stream the response.");
    destroyButton.disabled = false;
    promptButton.disabled = false;
    streamButton.disabled = false;
    updateUsage();
  } catch (error) {
    showError(error);
    setStatus("Create failed");
    createButton.disabled = false;
  } finally {
    checkButton.disabled = false;
  }
}

async function runPrompt({ streaming }) {
  if (!session) {
    showError(new Error("Create a session first."));
    return;
  }

  const prompt = promptInput.value.trim();
  if (!prompt) {
    showError(new Error("Enter a prompt."));
    return;
  }

  clearError();
  setOutput("");
  setPromptControls({ running: true });
  activePromptController = new AbortController();

  try {
    setStatus(streaming ? "Streaming..." : "Prompting...");

    if (streaming) {
      const stream = session.promptStreaming(prompt, {
        signal: activePromptController.signal,
      });

      for await (const chunk of stream) {
        appendOutput(chunk);
      }
    } else {
      const response = await session.prompt(prompt, {
        signal: activePromptController.signal,
      });
      setOutput(response);
    }

    setStatus("Session ready");
    updateUsage();
  } catch (error) {
    if (error.name === "AbortError") {
      setStatus("Stopped");
      setOutput(`${rawOutput}\n\nPrompt stopped.`);
    } else {
      showError(error);
      setStatus("Prompt failed");
    }
  } finally {
    activePromptController = null;
    setPromptControls({ running: false });
  }
}

function stopActivePrompt() {
  activePromptController?.abort();
}

function destroySession() {
  session?.destroy();
  session = null;
  activePromptController = null;
  destroyButton.disabled = true;
  promptButton.disabled = true;
  streamButton.disabled = true;
  stopButton.disabled = true;
  createButton.disabled = false;
  setStatus("Session destroyed");
  setOutput("Session destroyed. Create a new session to continue.");
  updateUsage();
}

function setPromptControls({ running }) {
  promptButton.disabled = running;
  streamButton.disabled = running;
  stopButton.disabled = !running;
  destroyButton.disabled = running || !session;
}

function updateUsage() {
  if (!session) {
    usageEl.textContent = "Context: unavailable";
    return;
  }

  usageEl.textContent = `Context: ${session.contextUsage}/${session.contextWindow}`;
}

function setStatus(message) {
  statusEl.textContent = message;
}

function setOutput(message) {
  rawOutput = message;
  outputEl.innerHTML = renderMarkdown(message);
}

function appendOutput(chunk) {
  rawOutput += chunk;
  outputEl.innerHTML = renderMarkdown(rawOutput);
}

function renderMarkdown(markdown) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const html = [];
  let paragraph = [];
  let listType = null;
  let codeBlock = null;

  const closeParagraph = () => {
    if (!paragraph.length) {
      return;
    }

    html.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
    paragraph = [];
  };

  const closeList = () => {
    if (!listType) {
      return;
    }

    html.push(`</${listType}>`);
    listType = null;
  };

  for (const line of lines) {
    const fence = line.match(/^```(\w*)\s*$/);

    if (fence) {
      if (codeBlock) {
        html.push(
          `<pre><code${codeBlock.language ? ` class="language-${codeBlock.language}"` : ""}>${escapeHtml(
            codeBlock.lines.join("\n")
          )}</code></pre>`
        );
        codeBlock = null;
      } else {
        closeParagraph();
        closeList();
        codeBlock = {
          language: escapeAttribute(fence[1] || ""),
          lines: [],
        };
      }
      continue;
    }

    if (codeBlock) {
      codeBlock.lines.push(line);
      continue;
    }

    if (!line.trim()) {
      closeParagraph();
      closeList();
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      closeParagraph();
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      continue;
    }

    const unorderedItem = line.match(/^\s*[-*]\s+(.+)$/);
    const orderedItem = line.match(/^\s*\d+\.\s+(.+)$/);

    if (unorderedItem || orderedItem) {
      closeParagraph();
      const nextListType = unorderedItem ? "ul" : "ol";

      if (listType !== nextListType) {
        closeList();
        html.push(`<${nextListType}>`);
        listType = nextListType;
      }

      html.push(`<li>${renderInline((unorderedItem || orderedItem)[1])}</li>`);
      continue;
    }

    closeList();
    paragraph.push(line.trim());
  }

  if (codeBlock) {
    html.push(
      `<pre><code${codeBlock.language ? ` class="language-${codeBlock.language}"` : ""}>${escapeHtml(
        codeBlock.lines.join("\n")
      )}</code></pre>`
    );
  }

  closeParagraph();
  closeList();

  return html.join("");
}

function renderInline(text) {
  const codeSpans = [];
  const codeToken = "\u0000CODE";

  return escapeHtml(text)
    .replace(/`([^`]+)`/g, (_, code) => {
      const index = codeSpans.push(`<code>${code}</code>`) - 1;
      return `${codeToken}${index}\u0000`;
    })
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    )
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\u0000CODE(\d+)\u0000/g, (_, index) => codeSpans[Number(index)]);
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return entities[character];
  });
}

function escapeAttribute(value) {
  return value.replace(/[^\w-]/g, "");
}

function clearError() {
  errorEl.hidden = true;
  errorEl.textContent = "";
}

function showError(error) {
  errorEl.hidden = false;
  errorEl.textContent = `${error.name || "Error"}: ${error.message || error}`;
}
