function bindTitleControls({ viewModel }) {
  const titleEl = document.getElementById("mapTitle");
  const titleShell = document.getElementById("mapTitleShell");
  if (!titleEl || !viewModel) {
    return;
  }

  let measureFrame = 0;

  function getMaxShellWidth() {
    if (!titleShell) {
      return 0;
    }
    const computed = window.getComputedStyle(titleShell);
    const cssMaxWidth = Number.parseFloat(computed.maxWidth);
    const rightReserve = Number.parseFloat(computed.getPropertyValue("--map-title-right-reserve")) || 0;
    const edge = Number.parseFloat(window.getComputedStyle(document.documentElement).getPropertyValue("--map-control-edge")) || 18;
    return Number.isFinite(cssMaxWidth)
      ? cssMaxWidth
      : Math.max(48, window.innerWidth - edge - rightReserve);
  }

  function getHorizontalPadding() {
    if (!titleShell) {
      return 0;
    }
    const computed = window.getComputedStyle(titleShell);
    const left = Number.parseFloat(computed.paddingLeft) || 0;
    const right = Number.parseFloat(computed.paddingRight) || 0;
    return left + right;
  }

  function measureWidestLine() {
    const range = document.createRange();
    range.selectNodeContents(titleEl);
    const rects = Array.from(range.getClientRects());
    range.detach();
    return rects.reduce((width, rect) => Math.max(width, rect.width), 0);
  }

  function syncShellWidth() {
    if (!titleShell) {
      return;
    }
    measureFrame = 0;

    const maxShellWidth = getMaxShellWidth();
    const padding = getHorizontalPadding();
    const minShellWidth = Number.parseFloat(window.getComputedStyle(titleShell).minWidth) || 48;
    let nextWidth = maxShellWidth;

    for (let index = 0; index < 3; index += 1) {
      titleShell.style.width = `${nextWidth}px`;
      const textWidth = Math.ceil(measureWidestLine());
      const measuredWidth = Math.min(maxShellWidth, Math.max(minShellWidth, textWidth + padding));
      if (Math.abs(measuredWidth - nextWidth) < 1) {
        nextWidth = measuredWidth;
        break;
      }
      nextWidth = measuredWidth;
    }

    titleShell.style.width = `${nextWidth}px`;
  }

  function scheduleShellWidthSync() {
    if (!titleShell || measureFrame) {
      return;
    }
    measureFrame = window.requestAnimationFrame(syncShellWidth);
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
    scheduleShellWidthSync();
  }

  function commitTitle({ persist = false, syncText = true } = {}) {
    const title = viewModel.setTitle?.(titleEl.textContent, { persist }) ?? "Layers";
    if (syncText && titleEl.textContent !== title) {
      titleEl.textContent = title;
    }
    syncEmptyState();
    scheduleShellWidthSync();
  }

  syncFromModel();
  window.addEventListener("resize", scheduleShellWidthSync);
  const layerMenu = document.getElementById("layerMenu");
  if (layerMenu) {
    const menuObserver = new MutationObserver(scheduleShellWidthSync);
    menuObserver.observe(layerMenu, { attributeFilter: ["class"] });
  }

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
