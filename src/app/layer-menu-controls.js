function setLayerMenuOpen(wrapper, panel, button, isOpen) {
  wrapper?.classList.toggle("is-open", isOpen);
  panel?.classList.toggle("is-open", isOpen);
  button?.setAttribute("aria-expanded", String(isOpen));
  button?.setAttribute("aria-label", isOpen ? "Close layer menu" : "Open layer menu");
}

const LAYER_MENU_POSITION_STORAGE_KEY = "layerv2.layerMenuPosition.v1";
const LAYER_MENU_DEFAULT_TOP = 72;
const LAYER_MENU_DEFAULT_RIGHT = 14;
const DRAG_THRESHOLD_PX = 6;
const LAYER_MENU_VIEWPORT_MARGIN = 12;

function readLayerMenuPosition() {
  try {
    const raw = window.localStorage?.getItem(LAYER_MENU_POSITION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const left = Number(parsed?.left);
    const top = Number(parsed?.top);
    if (!Number.isFinite(left) || !Number.isFinite(top)) {
      return null;
    }
    return { left, top };
  } catch {
    return null;
  }
}

function writeLayerMenuPosition(position) {
  if (!position || !Number.isFinite(position.left) || !Number.isFinite(position.top)) {
    return;
  }
  try {
    window.localStorage?.setItem(LAYER_MENU_POSITION_STORAGE_KEY, JSON.stringify(position));
  } catch {
    // ignore storage failures
  }
}

function getLayerMenuFootprint(wrapper, panel) {
  if (!wrapper) {
    return {
      leftOverflow: 0,
      rightOverflow: 0,
      topOverflow: 0,
      bottomOverflow: 0,
      width: 0,
      height: 0,
    };
  }

  const wrapperRect = wrapper.getBoundingClientRect();
  let left = wrapperRect.left;
  let right = wrapperRect.right;
  let top = wrapperRect.top;
  let bottom = wrapperRect.bottom;

  if (panel) {
    const panelRect = panel.getBoundingClientRect();
    left = Math.min(left, panelRect.left);
    right = Math.max(right, panelRect.right);
    top = Math.min(top, panelRect.top);
    bottom = Math.max(bottom, panelRect.bottom);
  }

  return {
    leftOverflow: Math.max(0, wrapperRect.left - left),
    rightOverflow: Math.max(0, right - wrapperRect.right),
    topOverflow: Math.max(0, wrapperRect.top - top),
    bottomOverflow: Math.max(0, bottom - wrapperRect.bottom),
    width: Math.max(wrapperRect.width, right - left),
    height: Math.max(wrapperRect.height, bottom - top),
  };
}

function clampLayerMenuPosition(wrapper, panel, left, top) {
  const footprint = getLayerMenuFootprint(wrapper, panel);
  const wrapperWidth = wrapper?.offsetWidth ?? 0;
  const wrapperHeight = wrapper?.offsetHeight ?? 0;
  const minLeft = footprint.leftOverflow;
  const minTop = footprint.topOverflow;
  const maxLeft = Math.max(minLeft, window.innerWidth - (wrapperWidth + footprint.rightOverflow));
  const maxTop = Math.max(minTop, window.innerHeight - (wrapperHeight + footprint.bottomOverflow));
  return {
    left: Math.max(minLeft, Math.min(maxLeft, Number(left) || 0)),
    top: Math.max(minTop, Math.min(maxTop, Number(top) || 0)),
  };
}

function applyLayerMenuPosition(wrapper, panel, position, { persist = true } = {}) {
  if (!wrapper || !position) {
    return null;
  }
  const clamped = clampLayerMenuPosition(wrapper, panel, position.left, position.top);
  wrapper.style.left = `${clamped.left}px`;
  wrapper.style.top = `${clamped.top}px`;
  wrapper.style.right = "auto";
  if (persist) {
    writeLayerMenuPosition(clamped);
  }
  return clamped;
}

function resolveDefaultLayerMenuPosition(wrapper, panel) {
  const footprint = getLayerMenuFootprint(wrapper, panel);
  return clampLayerMenuPosition(
    wrapper,
    panel,
    window.innerWidth - footprint.width - LAYER_MENU_DEFAULT_RIGHT + footprint.leftOverflow,
    LAYER_MENU_DEFAULT_TOP,
  );
}

function syncLayerMenuMaxHeight(wrapper, panel, button) {
  if (!wrapper || !panel || !button) {
    return;
  }

  const buttonRect = button.getBoundingClientRect();
  const wrapperRect = wrapper.getBoundingClientRect();
  const naturalTop = wrapperRect.top + buttonRect.height + 10;
  const viewportCap = Math.max(120, window.innerHeight - (LAYER_MENU_VIEWPORT_MARGIN * 2));
  const availableFromCurrentPosition = Math.max(120, window.innerHeight - naturalTop - LAYER_MENU_VIEWPORT_MARGIN);
  const availableHeight = Math.min(viewportCap, availableFromCurrentPosition);
  panel.style.maxHeight = `${availableHeight}px`;
}

function setAppearanceRowOpen(panel, button, datasetKey, isOpen, labels) {
  panel.dataset[datasetKey] = isOpen ? "true" : "false";
  button?.setAttribute("aria-expanded", String(isOpen));
  button?.setAttribute("aria-label", isOpen ? labels.open : labels.closed);
  button?.classList.toggle("is-open", isOpen);
  button.textContent = isOpen ? "×" : "";
}

function closeAppearanceRows(panel, controls, rerenderLayerMenu) {
  let changed = false;
  controls.forEach(({ button, datasetKey, labels }) => {
    if (panel.dataset[datasetKey] === "true") {
      changed = true;
    }
    setAppearanceRowOpen(panel, button, datasetKey, false, labels);
  });
  if (changed) {
    rerenderLayerMenu?.();
  }
}

function enableLayerMenuControls({
  wrapper,
  button,
  panel,
  earthButton,
  appearanceButton,
  screenButton,
  rerenderLayerMenu,
  onMobileMenuClosed,
}) {
  if (!wrapper || !button || !panel) {
    return;
  }

  const draggableMenuMediaQuery = window.matchMedia("(hover: hover) and (pointer: fine)");

  const isMenuOpen = () => panel.classList.contains("is-open");

  const stopPropagation = (event) => {
    if (!isMenuOpen()) {
      return;
    }
    event.stopPropagation();
  };

  const appearanceControls = [
    {
      button: earthButton,
      datasetKey: "earthRowOpen",
      labels: {
        open: "Hide globe styling rows",
        closed: "Show globe styling rows",
      },
    },
    {
      button: screenButton,
      datasetKey: "screenRowOpen",
      labels: {
        open: "Hide screen background row",
        closed: "Show screen background row",
      },
    },
    {
      button: appearanceButton,
      datasetKey: "appearanceRowOpen",
      labels: {
        open: "Hide settings background row",
        closed: "Show settings background row",
      },
    },
  ];

  appearanceControls.forEach(({ button: controlButton, datasetKey, labels }) => {
    panel.dataset[datasetKey] = panel.dataset[datasetKey] === "true" ? "true" : "false";
    setAppearanceRowOpen(panel, controlButton, datasetKey, panel.dataset[datasetKey] === "true", labels);
  });

  syncLayerMenuMaxHeight(wrapper, panel, button);
  setLayerMenuOpen(wrapper, panel, button, true);
  if (draggableMenuMediaQuery.matches) {
    const savedPosition = readLayerMenuPosition();
    applyLayerMenuPosition(wrapper, panel, savedPosition ?? resolveDefaultLayerMenuPosition(wrapper, panel), {
      persist: !savedPosition,
    });
  } else {
    wrapper.style.left = "";
    wrapper.style.right = "";
    wrapper.style.top = "";
  }

  let activeDrag = null;
  let suppressNextButtonClick = false;

  wrapper.addEventListener("pointerdown", stopPropagation);
  wrapper.addEventListener("click", stopPropagation);
  panel.addEventListener("pointerdown", stopPropagation);
  panel.addEventListener("click", stopPropagation);

  appearanceControls.forEach(({ button: controlButton, datasetKey, labels }) => {
    controlButton?.addEventListener("pointerdown", stopPropagation);
    controlButton?.addEventListener("click", (event) => {
      event.stopPropagation();
      const nextOpen = panel.dataset[datasetKey] !== "true";
      appearanceControls.forEach(({ button: otherButton, datasetKey: otherKey, labels: otherLabels }) => {
        setAppearanceRowOpen(panel, otherButton, otherKey, false, otherLabels);
      });
      setAppearanceRowOpen(panel, controlButton, datasetKey, nextOpen, labels);
      if (nextOpen) {
        panel.scrollTop = 0;
      }
      rerenderLayerMenu?.();
      if (draggableMenuMediaQuery.matches && event.detail > 0) {
        controlButton.blur();
      }
    });
  });

  function closeLayerMenu() {
    if (!panel.classList.contains("is-open")) {
      return;
    }
    closeAppearanceRows(panel, appearanceControls, rerenderLayerMenu);
    setLayerMenuOpen(wrapper, panel, button, false);
    if (!draggableMenuMediaQuery.matches) {
      wrapper.style.left = "";
      wrapper.style.right = "";
      wrapper.style.top = "";
      onMobileMenuClosed?.();
    }
  }

  function handleDragMove(event) {
    if (!activeDrag) {
      return;
    }

    const deltaX = event.clientX - activeDrag.startX;
    const deltaY = event.clientY - activeDrag.startY;
    if (!activeDrag.dragging && Math.hypot(deltaX, deltaY) >= DRAG_THRESHOLD_PX) {
      activeDrag.dragging = true;
      button.classList.add("is-dragging");
    }

    if (!activeDrag.dragging) {
      return;
    }

    event.preventDefault();
    activeDrag.lastPosition = applyLayerMenuPosition(wrapper, panel, {
      left: activeDrag.originLeft + deltaX,
      top: activeDrag.originTop + deltaY,
    });
  }

  function stopDrag() {
    if (!activeDrag) {
      return;
    }
    if (activeDrag.dragging) {
      suppressNextButtonClick = true;
      applyLayerMenuPosition(wrapper, panel, activeDrag.lastPosition ?? {
        left: activeDrag.originLeft,
        top: activeDrag.originTop,
      });
      if (draggableMenuMediaQuery.matches) {
        button.blur();
      }
    }
    button.classList.remove("is-dragging");
    window.removeEventListener("pointermove", handleDragMove);
    window.removeEventListener("pointerup", stopDrag);
    window.removeEventListener("pointercancel", stopDrag);
    activeDrag = null;
  }

  button.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
    if (!draggableMenuMediaQuery.matches) {
      return;
    }
    if (event.button !== 0) {
      return;
    }
    const rect = wrapper.getBoundingClientRect();
    activeDrag = {
      startX: event.clientX,
      startY: event.clientY,
      originLeft: rect.left,
      originTop: rect.top,
      lastPosition: { left: rect.left, top: rect.top },
      dragging: false,
    };
    window.addEventListener("pointermove", handleDragMove, { passive: false });
    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);
  });

  button.addEventListener("click", (event) => {
    event.stopPropagation();
    if (suppressNextButtonClick) {
      suppressNextButtonClick = false;
      return;
    }
    syncLayerMenuMaxHeight(wrapper, panel, button);
    const nextOpen = !panel.classList.contains("is-open");
    if (!nextOpen) {
      closeLayerMenu();
    } else {
      setLayerMenuOpen(wrapper, panel, button, true);
      if (!draggableMenuMediaQuery.matches) {
        wrapper.style.left = "";
        wrapper.style.right = "";
        wrapper.style.top = "";
      }
    }
    if (draggableMenuMediaQuery.matches && event.detail > 0) {
      button.blur();
    }
  });

  document.addEventListener("click", (event) => {
    if (draggableMenuMediaQuery.matches || !panel.classList.contains("is-open")) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }

    if (wrapper.contains(target)) {
      return;
    }

    closeLayerMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && panel.classList.contains("is-open")) {
      closeLayerMenu();
    }
  });

  wrapper.addEventListener("pointerleave", () => {
    if (!draggableMenuMediaQuery.matches) {
      return;
    }
    closeAppearanceRows(panel, appearanceControls, rerenderLayerMenu);
  });

  window.addEventListener("resize", () => {
    if (draggableMenuMediaQuery.matches) {
      applyLayerMenuPosition(wrapper, panel, readLayerMenuPosition() ?? resolveDefaultLayerMenuPosition(wrapper, panel));
    } else {
      wrapper.style.left = "";
      wrapper.style.right = "";
      wrapper.style.top = "";
    }
    syncLayerMenuMaxHeight(wrapper, panel, button);
  });

  return {
    close: closeLayerMenu,
  };
}

export { enableLayerMenuControls };
