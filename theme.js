(() => {
  const storageKey = "yyk.theme";
  const root = document.documentElement;
  const systemTheme = matchMedia("(prefers-color-scheme: dark)");
  let preference;
  try { preference = localStorage.getItem(storageKey); } catch {}
  const button = document.createElement("button");
  button.className = "theme-toggle";
  button.type = "button";

  function paint() {
    const theme = preference || (systemTheme.matches ? "dark" : "light");
    root.dataset.theme = theme;
    const label = theme === "dark" ? "切换到浅色模式" : "切换到深色模式";
    button.textContent = theme === "dark" ? "☀" : "☾";
    button.title = label;
    button.setAttribute("aria-label", label);
  }
  button.onclick = () => {
    preference = root.dataset.theme === "dark" ? "light" : "dark";
    try { localStorage.setItem(storageKey, preference); } catch {}
    paint();
  };
  systemTheme.addEventListener("change", paint);
  paint();
  document.addEventListener("DOMContentLoaded", () => {
    const dock = document.querySelector(".dock");
    const actions = dock?.querySelector(".dock-actions");
    if (actions) actions.prepend(button);
    else dock?.append(button);
  });
})();
