function setLayerMenuOpen(wrapper, panel, button, isOpen) {
  wrapper?.classList.toggle("is-open", isOpen);
  panel?.classList.toggle("is-open", isOpen);
  button?.setAttribute("aria-expanded", String(isOpen));
  button?.setAttribute("aria-label", isOpen ? "Close layer menu" : "Open layer menu");
}

function syncLayerMenuMaxHeight(wrapper, panel, button) {
  if (!wrapper || !panel || !button) {
    return;
  }

  const buttonRect = button.getBoundingClientRect();
  const wrapperRect = wrapper.getBoundingClientRect();
  const panelTop = wrapperRect.top + buttonRect.height + 10;
  const availableHeight = Math.max(120, window.innerHeight - panelTop - 12);
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
  appearanceButton,
  screenButton,
  rerenderLayerMenu,
}) {
  if (!wrapper || !button || !panel) {
    return;
  }

  const stopPropagation = (event) => {
    event.stopPropagation();
  };

  const appearanceControls = [
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
    });
  });

  button.addEventListener("click", () => {
    syncLayerMenuMaxHeight(wrapper, panel, button);
    const nextOpen = !panel.classList.contains("is-open");
    if (!nextOpen) {
      closeAppearanceRows(panel, appearanceControls, rerenderLayerMenu);
    }
    setLayerMenuOpen(wrapper, panel, button, nextOpen);
  });

  document.addEventListener("click", (event) => {
    if (!panel.classList.contains("is-open")) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }

    if (wrapper.contains(target)) {
      return;
    }

    closeAppearanceRows(panel, appearanceControls, rerenderLayerMenu);
    setLayerMenuOpen(wrapper, panel, button, false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && panel.classList.contains("is-open")) {
      closeAppearanceRows(panel, appearanceControls, rerenderLayerMenu);
      setLayerMenuOpen(wrapper, panel, button, false);
    }
  });

  window.addEventListener("resize", () => {
    if (!panel.classList.contains("is-open")) {
      return;
    }

    syncLayerMenuMaxHeight(wrapper, panel, button);
  });
}

export { enableLayerMenuControls };
