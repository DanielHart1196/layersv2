function closeOpenSelect() {
  window.__layersOpenCustomSelect?.close?.();
  window.__layersOpenCustomSelect = null;
}

function positionMenu(menu, anchor, { align = "left", minWidth = null } = {}) {
  const rect = anchor.getBoundingClientRect();
  const gap = 6;
  const viewportMargin = 8;
  const requestedWidth = minWidth ?? rect.width;
  const width = Math.min(
    Math.max(rect.width, requestedWidth),
    window.innerWidth - (viewportMargin * 2),
  );
  const left = align === "right"
    ? Math.max(viewportMargin, Math.min(window.innerWidth - width - viewportMargin, rect.right - width))
    : Math.max(viewportMargin, Math.min(window.innerWidth - width - viewportMargin, rect.left));

  menu.style.width = `${width}px`;
  menu.style.left = `${left}px`;

  const menuHeight = menu.getBoundingClientRect().height;
  const belowTop = rect.bottom + gap;
  const aboveTop = rect.top - gap - menuHeight;
  const fitsBelow = belowTop + menuHeight <= window.innerHeight - viewportMargin;
  const top = fitsBelow
    ? belowTop
    : Math.max(viewportMargin, aboveTop);
  menu.style.top = `${top}px`;
}

function createCustomSelect({
  anchor,
  options = [],
  value = "",
  label = "Choose option",
  align = "left",
  minWidth = null,
  onSelect,
} = {}) {
  if (!anchor) {
    return null;
  }

  closeOpenSelect();

  const menu = document.createElement("div");
  menu.className = "ui-select-options";
  menu.setAttribute("role", "listbox");
  menu.setAttribute("aria-label", label);
  menu.tabIndex = -1;

  const close = () => {
    window.removeEventListener("resize", handleReposition);
    window.removeEventListener("scroll", handleReposition, true);
    document.removeEventListener("pointerdown", handleOutsidePointer, true);
    document.removeEventListener("keydown", handleKeyDown, true);
    menu.remove();
    if (window.__layersOpenCustomSelect?.menu === menu) {
      window.__layersOpenCustomSelect = null;
    }
  };

  const selectValue = (nextValue) => {
    onSelect?.(nextValue);
    close();
  };

  const optionValues = Array.isArray(options) ? options : [];
  if (!optionValues.length) {
    const state = document.createElement("div");
    state.className = "ui-select-option-state";
    state.textContent = "No options";
    menu.append(state);
  } else {
    optionValues.forEach((option) => {
      const optionValue = typeof option === "object" ? option.value : option;
      const optionLabel = typeof option === "object" ? option.label : option;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ui-select-option";
      button.dataset.value = String(optionValue ?? "");
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", String(String(optionValue ?? "") === String(value ?? "")));
      button.textContent = String(optionLabel ?? "");
      if (String(optionValue ?? "") === String(value ?? "")) {
        button.classList.add("is-selected");
      }
      button.addEventListener("click", () => selectValue(optionValue));
      menu.append(button);
    });
  }

  function handleReposition() {
    positionMenu(menu, anchor, { align, minWidth });
  }

  function handleOutsidePointer(event) {
    if (menu.contains(event.target) || anchor.contains(event.target)) {
      return;
    }
    close();
  }

  function handleKeyDown(event) {
    if (event.key === "Escape") {
      close();
      anchor.focus?.();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Enter") {
      return;
    }

    const items = [...menu.querySelectorAll(".ui-select-option")];
    if (!items.length) {
      return;
    }
    event.preventDefault();
    const active = document.activeElement;
    const activeIndex = items.indexOf(active);
    if (event.key === "Enter" && activeIndex !== -1) {
      active.click();
      return;
    }
    const nextIndex = event.key === "ArrowUp"
      ? Math.max(0, activeIndex - 1)
      : Math.min(items.length - 1, activeIndex + 1);
    items[nextIndex === -1 ? 0 : nextIndex]?.focus();
  }

  document.body.append(menu);
  positionMenu(menu, anchor, { align, minWidth });
  window.__layersOpenCustomSelect = { menu, close };
  window.addEventListener("resize", handleReposition);
  window.addEventListener("scroll", handleReposition, true);
  setTimeout(() => {
    document.addEventListener("pointerdown", handleOutsidePointer, true);
    document.addEventListener("keydown", handleKeyDown, true);
  }, 0);

  const selected = menu.querySelector(".ui-select-option.is-selected");
  (selected ?? menu.querySelector(".ui-select-option"))?.focus();
  return { close, menu };
}

export { closeOpenSelect, createCustomSelect };
