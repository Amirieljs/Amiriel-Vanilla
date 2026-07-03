import type { AmirielMedia } from "@amiriel/core";
import { clearElement, el } from "./dom";
import { createAmirielMediaVideo } from "./AmirielMediaVideo";

export interface AmirielMediaLightboxOptions {
  closeLabel?: string;
  imageLabel?: string;
  videoLabel?: string;
  onClose: () => void;
}

export class AmirielMediaLightbox {
  private root: HTMLDivElement;
  private onClose: () => void;
  private onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") this.onClose();
  };

  constructor(options: AmirielMediaLightboxOptions) {
    this.onClose = options.onClose;
    this.root = el("div", {
      className: "amiriel-lightbox",
      role: "dialog",
      ariaModal: "true",
    }, el("button", {
      type: "button",
      className: "amiriel-lightbox__backdrop",
      ariaLabel: options.closeLabel ?? "Close",
      onclick: () => this.onClose(),
    }), el("div", { className: "amiriel-lightbox__frame" }, el("button", {
      type: "button",
      className: "amiriel-lightbox__close",
      ariaLabel: options.closeLabel ?? "Close",
      textContent: "x",
      onclick: () => this.onClose(),
    })));
    this.root.hidden = true;
  }

  mount(host: HTMLElement) {
    host.append(this.root);
  }

  open(media: AmirielMedia, labels?: { closeLabel?: string; imageLabel?: string; videoLabel?: string }) {
    const frame = this.root.querySelector(".amiriel-lightbox__frame") as HTMLDivElement;
    const closeButton = frame.querySelector(".amiriel-lightbox__close") as HTMLButtonElement;
    const backdrop = this.root.querySelector(".amiriel-lightbox__backdrop") as HTMLButtonElement;
    const label = media.type === "image"
      ? (labels?.imageLabel ?? "Image")
      : (labels?.videoLabel ?? "Video");

    this.root.setAttribute("aria-label", label);
    backdrop.setAttribute("aria-label", labels?.closeLabel ?? "Close");
    closeButton.setAttribute("aria-label", labels?.closeLabel ?? "Close");

    while (closeButton.nextSibling) {
      closeButton.nextSibling.remove();
    }

    if (media.type === "image") {
      frame.append(el("img", {
        src: media.url,
        alt: media.objectKey || label,
      }));
    } else {
      frame.append(createAmirielMediaVideo({ media, controls: true, autoPlay: true }));
    }

    this.root.hidden = false;
    window.addEventListener("keydown", this.onKeyDown);
  }

  close() {
    this.root.hidden = true;
    const frame = this.root.querySelector(".amiriel-lightbox__frame") as HTMLDivElement;
    const closeButton = frame.querySelector(".amiriel-lightbox__close") as HTMLButtonElement;
    while (closeButton.nextSibling) {
      closeButton.nextSibling.remove();
    }
    window.removeEventListener("keydown", this.onKeyDown);
  }

  destroy() {
    this.close();
    this.root.remove();
  }
}

export function mountAmirielMediaLightbox(host: HTMLElement, options: AmirielMediaLightboxOptions) {
  const lightbox = new AmirielMediaLightbox(options);
  lightbox.mount(host);
  return lightbox;
}
