import {
  AMIRIEL_FONT_STACKS,
  AMIRIEL_TEXT_COLORS,
  amirielThemeCssVars,
  clamp,
  combinedPageText,
  findAmirielThemeDefinition,
  heightPercentForWidth,
  mediaAspectRatio,
  normalizeDocument,
  normalizePaperSize,
  resolveAmirielLabels,
  safeAspectRatio,
  sortAmirielPages,
  type AmirielDocument,
  type AmirielLabels,
  type AmirielLocale,
  type AmirielMedia,
  type AmirielMediaPlacement,
  type AmirielPage,
  type AmirielPaperSize,
  type AmirielPaperSizeLimits,
  type AmirielTextBlock,
  type AmirielThemeDefinition,
} from "amiriel";
import { clearElement, el } from "./dom";
import { AmirielMediaLightbox } from "./AmirielMediaLightbox";
import { createAmirielMediaVideo } from "./AmirielMediaVideo";

export interface AmirielBodyRendererOptions {
  document: AmirielDocument;
  pageIndex?: number;
  title?: string;
  locale?: AmirielLocale;
  labels?: Partial<AmirielLabels>;
  themes?: AmirielThemeDefinition[];
  variant?: "paper" | "layer";
  interactive?: boolean;
  hidden?: boolean;
  lightbox?: boolean;
  defaultPaperSize?: AmirielPaperSize;
  paperSizeLimits?: AmirielPaperSizeLimits;
  paperResizable?: boolean;
  className?: string;
  onMediaClick?: (media: AmirielMedia) => void;
}

export interface AmirielBodyRendererHandle {
  update(options: Partial<AmirielBodyRendererOptions>): void;
  destroy(): void;
}

function textBlockContentStyle(block: AmirielTextBlock, page?: AmirielPage): Partial<CSSStyleDeclaration> {
  const font = block.font || page?.font || "handwritten";
  return {
    fontFamily: AMIRIEL_FONT_STACKS[font],
    fontSize: `${block.fontSize || 16}px`,
    fontWeight: block.bold ? "700" : undefined,
    fontStyle: block.italic ? "italic" : undefined,
    textDecoration: block.underline ? "underline" : undefined,
    ...(block.color ? { color: AMIRIEL_TEXT_COLORS[block.color] } : {}),
  };
}

function textBlockStyle(block: AmirielTextBlock): Partial<CSSStyleDeclaration> {
  return {
    left: `${block.x}%`,
    top: `${block.y}%`,
    width: `${block.width}%`,
    height: `${block.height || 22}%`,
    zIndex: String(block.z),
  };
}

class AmirielBodyRendererImpl implements AmirielBodyRendererHandle {
  private host: HTMLElement;
  private options: AmirielBodyRendererOptions;
  private root: HTMLDivElement;
  private paperFrame: HTMLElement;
  private paperSurface: HTMLElement;
  private contentHost: HTMLElement;
  private lightbox: AmirielMediaLightbox | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private scale = 1;

  constructor(host: HTMLElement, options: AmirielBodyRendererOptions) {
    this.host = host;
    this.options = { locale: "en", variant: "paper", interactive: true, hidden: false, lightbox: true, paperResizable: true, pageIndex: 0, ...options };
    this.root = el("div");
    this.paperFrame = el("div", { className: "amiriel-renderer__paper-frame" });
    this.paperSurface = el("article", { className: "amiriel-renderer__paper" });
    this.contentHost = el("div", { className: "amiriel-renderer__content" });
    this.paperSurface.append(
      el("div", { className: "amiriel-renderer__head" }, el("p", { className: "amiriel-renderer__label" })),
      this.contentHost,
    );
    this.paperFrame.append(this.paperSurface);
    this.root.append(this.paperFrame);
    clearElement(host);
    host.append(this.root);
    this.render();
    this.observeScale();
  }

  update(options: Partial<AmirielBodyRendererOptions>) {
    this.options = { ...this.options, ...options };
    this.render();
  }

  destroy() {
    this.resizeObserver?.disconnect();
    this.lightbox?.destroy();
    clearElement(this.host);
  }

  private observeScale() {
    const refresh = () => {
      const normalizeOptions = {
        defaultPaperSize: this.options.defaultPaperSize,
        paperSizeLimits: this.options.paperSizeLimits,
        paperResizable: this.options.paperResizable,
      };
      const normalized = normalizeDocument(this.options.document, normalizeOptions);
      const paperSize = normalizePaperSize(normalized.paper, normalizeOptions);
      const widthScale = this.paperFrame.clientWidth > 0 ? this.paperFrame.clientWidth / paperSize.width : 1;
      if (this.options.variant === "layer") {
        const heightScale = this.paperFrame.clientHeight > 0 ? this.paperFrame.clientHeight / paperSize.height : widthScale;
        this.scale = Math.min(widthScale, heightScale);
      } else {
        this.scale = widthScale;
      }
      this.applyScale(paperSize);
    };

    refresh();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", refresh);
      return;
    }
    this.resizeObserver = new ResizeObserver(refresh);
    this.resizeObserver.observe(this.paperFrame);
  }

  private applyScale(paperSize: AmirielPaperSize) {
    this.paperFrame.style.height = `${paperSize.height * this.scale}px`;
    Object.assign(this.paperSurface.style, {
      width: `${paperSize.width}px`,
      height: `${paperSize.height}px`,
      transform: `scale(${this.scale})`,
    });
  }

  private ensureLightbox() {
    if (!this.options.lightbox || this.lightbox) return;
    this.lightbox = new AmirielMediaLightbox({ onClose: () => this.lightbox?.close() });
    this.lightbox.mount(this.root);
  }

  private openMedia(media: AmirielMedia) {
    if (!this.options.interactive) return;
    if (this.options.onMediaClick) {
      this.options.onMediaClick(media);
      return;
    }
    if (!this.options.lightbox) return;
    this.ensureLightbox();
    const labels = resolveAmirielLabels(this.options.locale, this.options.labels);
    this.lightbox?.open(media, {
      closeLabel: labels.close,
      imageLabel: labels.image,
      videoLabel: labels.video,
    });
  }

  private render() {
    const {
      document,
      pageIndex = 0,
      title,
      locale = "en",
      labels,
      themes,
      variant = "paper",
      interactive = true,
      hidden = false,
      className,
      defaultPaperSize,
      paperSizeLimits,
      paperResizable = true,
    } = this.options;

    const normalizeOptions = { defaultPaperSize, paperSizeLimits, paperResizable };
    const resolvedLabels = resolveAmirielLabels(locale, labels);
    const normalized = normalizeDocument(document, normalizeOptions);
    const activePaperSize = normalizePaperSize(normalized.paper, normalizeOptions);
    const activeThemeStyle = amirielThemeCssVars(findAmirielThemeDefinition(normalized.theme, themes));
    const sortedPages = sortAmirielPages(normalized.pages);
    const currentPage = sortedPages[pageIndex] ?? sortedPages[0];
    const currentTextBlocks = currentPage?.textBlocks ?? [];

    this.root.className = [
      "amiriel-renderer",
      `amiriel-renderer--${variant}`,
      hidden ? "amiriel-renderer--hidden" : "",
      className,
    ].filter(Boolean).join(" ");
    Object.assign(this.root.style, activeThemeStyle as Partial<CSSStyleDeclaration>);

    const labelNode = this.paperSurface.querySelector(".amiriel-renderer__label") as HTMLParagraphElement;
    labelNode.textContent = title ?? "";

    clearElement(this.contentHost);

    if (currentTextBlocks.length) {
      const layer = el("span", { className: "amiriel-renderer__text-layer" });
      for (const block of currentTextBlocks) {
        layer.append(el("span", {
          className: "amiriel-renderer__text-block",
          style: { ...textBlockStyle(block), ...textBlockContentStyle(block, currentPage) },
          textContent: block.text,
        }));
      }
      this.contentHost.append(layer);
    } else {
      this.contentHost.append(el("p", {
        className: variant === "layer" ? "amiriel-renderer__body amiriel-renderer__body--layer" : "amiriel-renderer__body",
        style: { fontFamily: AMIRIEL_FONT_STACKS[currentPage?.font || "handwritten"] },
        textContent: combinedPageText(currentPage),
      }));
    }

    const placements = currentPage?.mediaPlacements ?? [];
    if (placements.length) {
      const mediaLayer = el("span", { className: "amiriel-renderer__media-layer" });
      for (const placement of placements) {
        const media = normalized.media.find((item) => item.id === placement.mediaId);
        if (!media) continue;
        const heightPercent = clamp(heightPercentForWidth(
          placement.width,
          placement.aspectRatio || mediaAspectRatio(media),
          activePaperSize.width,
          activePaperSize.height,
        ), 8, 100 - placement.y);

        const button = el("button", {
          type: "button",
          className: "amiriel-renderer__media",
          style: {
            left: `${placement.x}%`,
            top: `${placement.y}%`,
            width: `${placement.width}%`,
            height: `${heightPercent}%`,
            aspectRatio: String(placement.aspectRatio || safeAspectRatio(media.width, media.height) || safeAspectRatio(placement.width, placement.height)),
            zIndex: String(placement.z),
          },
          disabled: !interactive,
          tabIndex: interactive ? 0 : -1,
          ariaLabel: resolvedLabels.viewMedia,
          onclick: (event) => {
            event.stopPropagation();
            this.openMedia(media);
          },
        });

        if (media.type === "image") {
          button.append(el("img", { src: media.url, alt: media.objectKey || "media", draggable: "false" }));
        } else {
          button.append(
            createAmirielMediaVideo({ media, showDurationBadge: true, muted: true, preload: "metadata" }),
            el("span", { className: "amiriel-renderer__video-mark", ariaHidden: "true", textContent: "play" }),
          );
        }
        mediaLayer.append(button);
      }
      this.contentHost.append(mediaLayer);
    }

    this.applyScale(activePaperSize);
  }
}

export function createAmirielBodyRenderer(host: HTMLElement, options: AmirielBodyRendererOptions): AmirielBodyRendererHandle {
  return new AmirielBodyRendererImpl(host, options);
}

export function renderAmirielBody(host: HTMLElement, options: AmirielBodyRendererOptions): AmirielBodyRendererHandle {
  return createAmirielBodyRenderer(host, options);
}
