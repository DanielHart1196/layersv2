function setRefreshMenuOpen(wrapper, menu, button, isOpen) {
  wrapper?.classList.toggle("is-open", isOpen);
  menu?.classList.toggle("is-open", isOpen);
  button?.setAttribute("aria-expanded", String(isOpen));
}

async function reloadWithCacheClear() {
  try {
    if ("caches" in window) {
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map((cacheKey) => caches.delete(cacheKey)));
    }

    window.localStorage?.clear();
    window.sessionStorage?.clear();
  } catch (_error) {
    // Ignore cache clear failures and still continue with URL-busted reload.
  }

  const reloadUrl = new URL(window.location.href);
  reloadUrl.searchParams.set("_reload", String(Date.now()));
  window.location.replace(reloadUrl.toString());
}

function enableRefreshControls({
  wrapper,
  button,
  menu,
  hardReloadButton,
  clearCacheReloadButton,
  onBeforeMenuOpen,
  mobileMediaQuery = window.matchMedia("(max-width: 800px)"),
}) {
  if (!wrapper || !button || !menu || !hardReloadButton || !clearCacheReloadButton) {
    return;
  }

  let pressTimer = null;
  let longPressTriggered = false;

  const stopPropagation = (event) => {
    event.stopPropagation();
  };

  const clearPressTimer = () => {
    if (pressTimer == null) {
      return;
    }
    window.clearTimeout(pressTimer);
    pressTimer = null;
  };

  const openRefreshMenu = () => {
    longPressTriggered = true;
    onBeforeMenuOpen?.();
    setRefreshMenuOpen(wrapper, menu, button, true);
  };

  const startPress = () => {
    clearPressTimer();
    longPressTriggered = false;
    pressTimer = window.setTimeout(openRefreshMenu, 450);
  };

  wrapper.addEventListener("pointerdown", stopPropagation);
  wrapper.addEventListener("click", stopPropagation);
  menu.addEventListener("pointerdown", stopPropagation);
  menu.addEventListener("click", stopPropagation);

  button.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse") {
      return;
    }
    startPress();
  });

  button.addEventListener("pointerup", clearPressTimer);
  button.addEventListener("pointerleave", clearPressTimer);
  button.addEventListener("pointercancel", clearPressTimer);

  button.addEventListener("click", (event) => {
    if (longPressTriggered) {
      event.preventDefault();
      longPressTriggered = false;
      return;
    }

    window.location.reload();
  });

  button.addEventListener("contextmenu", (event) => {
    if (mobileMediaQuery.matches) {
      return;
    }

    event.preventDefault();
    const nextOpen = !menu.classList.contains("is-open");
    if (nextOpen) {
      onBeforeMenuOpen?.();
    }
    setRefreshMenuOpen(wrapper, menu, button, nextOpen);
  });

  hardReloadButton.addEventListener("click", () => {
    setRefreshMenuOpen(wrapper, menu, button, false);
    const reloadUrl = new URL(window.location.href);
    reloadUrl.searchParams.set("_reload", String(Date.now()));
    window.location.replace(reloadUrl.toString());
  });

  clearCacheReloadButton.addEventListener("click", async () => {
    setRefreshMenuOpen(wrapper, menu, button, false);
    await reloadWithCacheClear();
  });

  document.addEventListener("click", (event) => {
    if (!menu.classList.contains("is-open")) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }

    if (wrapper.contains(target)) {
      return;
    }

    setRefreshMenuOpen(wrapper, menu, button, false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menu.classList.contains("is-open")) {
      setRefreshMenuOpen(wrapper, menu, button, false);
    }
  });
}

export { enableRefreshControls };
