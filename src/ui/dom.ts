export function html(template: string): DocumentFragment {
  const node = document.createElement("template");
  node.innerHTML = template.trim();
  return node.content;
}

export function escapeText(value: unknown): string {
  const element = document.createElement("span");
  element.textContent = String(value ?? "");
  return element.innerHTML;
}

export function formatSigned(value: number): string {
  return `${value > 0 ? "+" : ""}${value}`;
}
