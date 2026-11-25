export function onRouterTransitionStart(url: string) {
  window.dispatchEvent(new CustomEvent("tradeworx-navigation-start", { detail: url }));
}
