type AttrValue = string | number | boolean | undefined | null;
type Attrs = Record<string, AttrValue | Partial<CSSStyleDeclaration> | EventListener>;
type Child = Node | string | null | undefined | false;

export function el<T extends HTMLElement>(tag: string, attrs?: Attrs, ...children: Child[]): T {
  const node = document.createElement(tag) as T;
  let deferredValue: string | number | undefined;

  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined || value === null || value === false) continue;

      if (key === "className") {
        node.className = String(value);
        continue;
      }

      if (key === "textContent") {
        node.textContent = String(value);
        continue;
      }

      if (key === "value" && (tag === "select" || tag === "textarea" || tag === "input" || tag === "option")) {
        deferredValue = value as string | number;
        continue;
      }

      if (key === "style" && typeof value === "object") {
        Object.assign(node.style, value);
        continue;
      }

      if (key.startsWith("on") && typeof value === "function") {
        const eventName = key.slice(2).toLowerCase();
        node.addEventListener(eventName, value as EventListener);
        continue;
      }

      if (value === true) {
        node.setAttribute(key, "");
        continue;
      }

      if (key in node) {
        (node as Record<string, unknown>)[key] = value;
        continue;
      }

      node.setAttribute(key, String(value));
    }
  }

  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }

  if (deferredValue !== undefined && "value" in node) {
    (node as unknown as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value = String(deferredValue);
  }

  return node;
}

export function clearElement(node: HTMLElement) {
  while (node.firstChild) node.removeChild(node.firstChild);
}
