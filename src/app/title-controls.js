function bindTitleControls({ viewModel }) {
  const titleEl = document.getElementById("mapTitle");
  if (!titleEl || !viewModel) {
    return;
  }

  function syncEmptyState() {
    titleEl.dataset.empty = String(titleEl.textContent.trim() === "");
  }

  function syncFromModel() {
    const title = viewModel.getTitle?.() ?? "Layers";
    if (titleEl.textContent !== title) {
      titleEl.textContent = title;
    }
    syncEmptyState();
  }

  function commitTitle({ persist = false, syncText = true } = {}) {
    const title = viewModel.setTitle?.(titleEl.textContent, { persist }) ?? "Layers";
    if (syncText && titleEl.textContent !== title) {
      titleEl.textContent = title;
    }
    syncEmptyState();
  }

  syncFromModel();

  titleEl.addEventListener("input", () => {
    commitTitle({ syncText: false });
  });

  titleEl.addEventListener("blur", () => {
    commitTitle({ persist: true });
  });

  titleEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      titleEl.blur();
    }
  });

  titleEl.addEventListener("paste", (event) => {
    event.preventDefault();
    const text = event.clipboardData?.getData("text/plain") ?? "";
    document.execCommand("insertText", false, text);
  });
}

export { bindTitleControls };
