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
const TOOLBAR_EARTH_PATHS = Object.freeze([
  "M17.72 18.32 L17.47 18.28 L17.46 18.47 L17.68 18.81 L17.74 19.08 L17.97 19.42 L18.21 19.43 L18.28 19.45 L18.55 19.18 L18.68 19.28 L18.72 18.96 L18.85 18.82 L18.82 18.35 L18.6 18.32 L18.3 18.4 L18.09 18.46 L17.72 18.32 Z",
  "M17.02 7.51 L17.04 7.36 L17.01 7.13 L16.87 6.93 L16.85 6.76 L16.76 6.71 L16.73 6.46 L16.62 6.27 L16.48 6.42 L16.47 6.53 L16.4 6.75 L16.31 6.96 L16.37 7.1 L16.3 7.18 L16.25 7.48 L16.29 7.71 L16.26 7.82 L16.32 8.02 L16.2 8.34 L16.15 8.56 L16.07 8.73 L16 8.95 L15.75 9.08 L15.38 8.95 L15.33 8.83 L15.13 8.72 L15.02 8.72 L14.74 8.49 L14.55 8.35 L14.26 8.22 L13.95 8 L13.93 7.89 L14.06 7.69 L14.17 7.49 L14.13 7.33 L14.26 7.32 L14.4 7.15 L14.51 6.94 L14.33 6.74 L14.24 6.82 L14.1 6.78 L13.88 6.9 L13.64 6.78 L13.53 6.82 L13.21 6.71 L13.01 6.55 L12.76 6.45 L12.55 6.51 L12.83 6.64 L12.84 6.85 L12.52 6.92 L12.32 6.87 L12.09 7.01 L11.93 7.24 L11.99 7.34 L11.81 7.45 L11.63 7.77 L11.71 7.99 L11.47 7.95 L11.23 7.95 L11.02 7.71 L10.74 7.53 L10.56 7.58 L10.39 7.64 L10.38 7.74 L10.21 7.69 L10.21 7.8 L10.02 7.87 L9.92 8.03 L9.72 8.23 L9.67 8.53 L9.5 8.44 L9.38 8.64 L9.52 8.83 L9.36 8.91 L9.2 8.56 L8.93 8.9 L8.92 9.12 L8.9 9.28 L8.68 9.48 L8.58 9.7 L8.37 9.87 L7.97 9.99 L7.76 9.98 L7.66 10.02 L7.6 10.11 L7.37 10.15 L7.07 10.3 L6.97 10.25 L6.79 10.28 L6.5 10.43 L6.32 10.6 L6.01 10.73 L5.85 11.01 L5.82 10.7 L5.66 10.99 L5.7 11.22 L5.65 11.42 L5.57 11.52 L5.53 11.75 L5.62 11.87 L5.66 12 L5.84 12.31 L5.85 12.52 L5.74 12.36 L5.55 12.25 L5.68 12.62 L5.51 12.45 L5.56 12.62 L5.78 12.93 L5.83 13.25 L6 13.41 L6.01 13.52 L6.16 13.78 L6.14 14.01 L6.2 14.24 L6.41 14.64 L6.45 14.88 L6.4 15.16 L6.42 15.3 L6.35 15.39 L6.16 15.45 L6.15 15.68 L6.36 15.75 L6.76 16.01 L7.02 16.01 L7.3 16.03 L7.48 15.9 L7.67 15.79 L7.78 15.8 L8.01 15.59 L8.27 15.57 L8.54 15.53 L8.88 15.6 L9.12 15.57 L9.44 15.56 L9.58 15.39 L9.66 15.18 L9.99 15.09 L10.39 14.89 L10.75 14.91 L11.19 14.78 L11.68 14.64 L12.36 14.6 L12.73 14.79 L13 14.8 L13.49 15.05 L13.41 15.14 L13.61 15.29 L13.85 15.58 L13.84 15.79 L14.14 15.96 L14.28 15.64 L14.52 15.5 L14.83 15.16 L14.86 15.46 L14.72 15.65 L14.66 15.88 L14.46 16.1 L14.8 16.03 L14.98 15.75 L15.08 16.05 L14.95 16.24 L15.32 16.29 L15.5 16.46 L15.59 16.66 L15.66 16.96 L15.91 17.21 L16.28 17.32 L16.5 17.35 L16.71 17.42 L17.04 17.52 L17.38 17.23 L17.58 17.16 L17.52 17.37 L17.76 17.44 L18.07 17.61 L18.3 17.44 L18.48 17.29 L18.83 17.12 L19.26 17.11 L19.48 16.97 L19.46 16.84 L19.5 16.57 L19.6 16.27 L19.75 16.07 L19.86 15.72 L19.99 15.53 L20.13 15.22 L20.41 15.02 L20.58 14.66 L20.65 14.37 L20.65 14.14 L20.75 13.78 L20.81 13.6 L20.84 13.24 L20.65 12.9 L20.68 12.66 L20.67 12.43 L20.56 12.11 L20.27 11.78 L20.09 11.63 L19.82 11.38 L19.75 10.96 L19.66 11.02 L19.51 10.85 L19.35 10.94 L19.21 10.5 L18.99 10.25 L19.04 10.16 L18.78 9.98 L18.51 9.79 L18.1 9.58 L17.98 9.31 L18.01 9.1 L17.91 8.76 L17.81 8.71 L17.76 8.51 L17.68 8.17 L17.71 7.99 L17.53 7.84 L17.41 7.67 L17.16 7.82 L17.02 7.51 Z",
]);

function createSvgElement(tagName) {
  return document.createElementNS("http://www.w3.org/2000/svg", tagName);
}

function createToolbarGlobeSvg() {
  const oceanColor = "#2c6f92";
  const landColor = "#6eaa6e";
  const landLineColor = "#000000";
  const graticulesColor = "#8fa9bc";
  const oceanOpacity = 1;
  const landOpacity = 1;
  const landLineOpacity = 1;
  const graticulesOpacity = 1;
  const landLineWidth = 1;
  const graticulesWidth = 1;
  const graticulePaths = [
    "M13 2.4C11 5.2 10.1 9 10.1 13C10.1 17 11 20.8 13 23.6",
    "M2.4 13C5.2 11.5 8.8 10.8 13 10.8C17.2 10.8 20.8 11.5 23.6 13",
  ];
  const renderLayerIds = ["ocean.fill", "graticules.line", "land.line", "land.fill"];

  const svg = createSvgElement("svg");
  svg.classList.add("layer-menu-toolbar-globe-svg");
  svg.setAttribute("viewBox", "0 0 26 26");
  svg.setAttribute("width", "18");
  svg.setAttribute("height", "18");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const clipId = `layer-menu-toolbar-globe-clip-${Math.random().toString(36).slice(2, 8)}`;

  const defs = createSvgElement("defs");
  const clipPath = createSvgElement("clipPath");
  clipPath.setAttribute("id", clipId);
  const clipCircle = createSvgElement("circle");
  clipCircle.setAttribute("cx", "13");
  clipCircle.setAttribute("cy", "13");
  clipCircle.setAttribute("r", "11");
  clipPath.append(clipCircle);
  defs.append(clipPath);
  svg.append(defs);

  const contentGroup = createSvgElement("g");
  contentGroup.setAttribute("clip-path", `url(#${clipId})`);
  svg.append(contentGroup);

  renderLayerIds.forEach((layerId) => {
    if (layerId === "ocean.fill") {
      const globe = createSvgElement("circle");
      globe.setAttribute("cx", "13");
      globe.setAttribute("cy", "13");
      globe.setAttribute("r", "11");
      globe.setAttribute("fill", oceanColor);
      globe.setAttribute("fill-opacity", String(oceanOpacity));
      contentGroup.append(globe);
      return;
    }

    if (layerId === "graticules.line") {
      graticulePaths.forEach((pathData) => {
        const path = createSvgElement("path");
        path.setAttribute("d", pathData);
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", graticulesColor);
        path.setAttribute("stroke-opacity", String(graticulesOpacity));
        path.setAttribute("stroke-width", String(graticulesWidth));
        path.setAttribute("stroke-linecap", "round");
        contentGroup.append(path);
      });
      return;
    }

    if (layerId === "land.fill") {
      TOOLBAR_EARTH_PATHS.forEach((pathData) => {
        const path = createSvgElement("path");
        path.setAttribute("d", pathData);
        path.setAttribute("fill", landColor);
        path.setAttribute("fill-opacity", String(landOpacity));
        contentGroup.append(path);
      });
      return;
    }

    if (layerId === "land.line") {
      TOOLBAR_EARTH_PATHS.forEach((pathData) => {
        const path = createSvgElement("path");
        path.setAttribute("d", pathData);
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", landLineColor);
        path.setAttribute("stroke-opacity", String(landLineOpacity));
        path.setAttribute("stroke-width", String(landLineWidth));
        path.setAttribute("stroke-linejoin", "round");
        path.setAttribute("stroke-linecap", "round");
        contentGroup.append(path);
      });
    }
  });

  const outline = createSvgElement("circle");
  outline.setAttribute("cx", "13");
  outline.setAttribute("cy", "13");
  outline.setAttribute("r", "11");
  outline.setAttribute("fill", "none");
  outline.setAttribute("stroke", "#000000");
  outline.setAttribute("stroke-width", "1");
  svg.append(outline);

  return svg;
}

function createToolbarGearSvg() {
  const svg = createSvgElement("svg");
  svg.classList.add("layer-menu-toolbar-gear-svg");
  svg.setAttribute("viewBox", "0 0 26 26");
  svg.setAttribute("width", "18");
  svg.setAttribute("height", "18");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");

  const gear = createSvgElement("path");
  gear.setAttribute("d", "M9.405 1.05c-.413-1.4-2.397-1.4-2.81 0l-.1.34a1.464 1.464 0 0 1-2.105.872l-.31-.17c-1.283-.698-2.686.705-1.987 1.987l.169.311c.446.82.023 1.841-.872 2.105l-.34.1c-1.4.413-1.4 2.397 0 2.81l.34.1a1.464 1.464 0 0 1 .872 2.105l-.17.31c-.698 1.283.705 2.686 1.987 1.987l.311-.169a1.464 1.464 0 0 1 2.105.872l.1.34c.413 1.4 2.397 1.4 2.81 0l.1-.34a1.464 1.464 0 0 1 2.105-.872l.31.17c1.283.698 2.686-.705 1.987-1.987l-.169-.311a1.464 1.464 0 0 1 .872-2.105l.34-.1c1.4-.413 1.4-2.397 0-2.81l-.34-.1a1.464 1.464 0 0 1-.872-2.105l.17-.31c.698-1.283-.705-2.686-1.987-1.987l-.311.169a1.464 1.464 0 0 1-2.105-.872zM8 10.93a2.929 2.929 0 1 1 0-5.86 2.929 2.929 0 0 1 0 5.858z");
  gear.setAttribute("fill", "#b8b8b8");
  gear.setAttribute("fill-rule", "evenodd");
  gear.setAttribute("stroke", "#000000");
  gear.setAttribute("stroke-width", "0.55");
  gear.setAttribute("stroke-linejoin", "round");
  gear.setAttribute("transform", "translate(5 5)");
  svg.append(gear);

  return svg;
}

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
  if (button) {
    if (button.classList.contains("layer-menu-earth-button")) {
      const globe = createToolbarGlobeSvg();
      if (isOpen) {
        const closeMark = document.createElement("span");
        closeMark.className = "layer-menu-toolbar-close";
        closeMark.setAttribute("aria-hidden", "true");
        closeMark.textContent = "×";
        button.replaceChildren(globe, closeMark);
      } else {
        button.replaceChildren(globe);
      }
    } else if (button.id === "layerMenuScreenButton") {
      const gear = createToolbarGearSvg();
      if (isOpen) {
        const closeMark = document.createElement("span");
        closeMark.className = "layer-menu-toolbar-close";
        closeMark.setAttribute("aria-hidden", "true");
        closeMark.textContent = "×";
        button.replaceChildren(gear, closeMark);
      } else {
        button.replaceChildren(gear);
      }
    } else if (isOpen) {
      button.textContent = "×";
    } else {
      button.innerHTML = button.dataset.closedHtml ?? "";
    }
  }
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
        open: "Hide earth styling rows",
        closed: "Show earth styling rows",
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
  setLayerMenuOpen(wrapper, panel, button, false);
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
