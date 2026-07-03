import {
  AMIRIEL_FONT_OPTIONS,
  AMIRIEL_TEXT_COLOR_OPTIONS,
  amirielThemeCssVars,
  createAmirielId,
  findAmirielThemeDefinition,
  formatAmirielLabel,
  mediaAspectRatio,
  mediaSizeWithinPaper,
  mergeAmirielThemeDefinitions,
  normalizeDocument,
  normalizePaperSize,
  normalizePaperSizeLimits,
  resolveAmirielLabels,
  syncPageText,
  themeDefaultTextColorFor,
  type AmirielDocument,
  type AmirielEditorLimits,
  type AmirielFont,
  type AmirielLabels,
  type AmirielLocale,
  type AmirielMedia,
  type AmirielMediaPlacement,
  type AmirielMediaRequest,
  type AmirielPage,
  type AmirielPaperSize,
  type AmirielPaperSizeLimits,
  type AmirielTextBlock,
  type AmirielTextColor,
  type AmirielThemeDefinition,
} from "amiriel";
import { createAmirielBodyRenderer, type AmirielBodyRendererHandle } from "./AmirielBodyRenderer";
import { AmirielMediaLightbox } from "./AmirielMediaLightbox";
import { createAmirielMediaVideo } from "./AmirielMediaVideo";
import { createGithubMarkIcon } from "./GithubMarkIcon";
import { clearElement, el } from "./dom";

const DEFAULT_GITHUB_URL = "https://github.com/Amirieljs/Amiriel-Vanilla";

export interface CreateAmirielEditorOptions {
  value?: AmirielDocument;
  onChange?: (value: AmirielDocument) => void;
  readOnly?: boolean;
  limits?: AmirielEditorLimits;
  locale?: AmirielLocale;
  labels?: Partial<AmirielLabels>;
  themes?: AmirielThemeDefinition[];
  accept?: string;
  showGithubLink?: boolean;
  githubUrl?: string;
  onMediaRequest?: (request: AmirielMediaRequest<File>) => void | Promise<void>;
  onMediaRemoved?: (media: AmirielMedia) => void;
  defaultPaperSize?: AmirielPaperSize;
  paperSizeLimits?: AmirielPaperSizeLimits;
  paperResizable?: boolean;
  className?: string;
}

export interface AmirielEditorHandle {
  getDocument(): AmirielDocument;
  setDocument(value: AmirielDocument): void;
  setReadOnly(readOnly: boolean): void;
  destroy(): void;
}

type PaperDimension = "width" | "height";

function nextZ(page: AmirielPage) {
  return Math.max(
    0,
    ...(page.mediaPlacements ?? []).map((placement) => placement.z),
    ...(page.textBlocks ?? []).map((block) => block.z),
  ) + 1;
}

function syncPageMediaIds(page: AmirielPage) {
  page.mediaIds = Array.from(new Set((page.mediaPlacements ?? []).map((placement) => placement.mediaId)));
}

function mediaThumbnail(item: AmirielMedia) {
  return item.thumbnailUrl || item.url;
}

class AmirielBodyEditorImpl implements AmirielEditorHandle {
  private host: HTMLElement;
  private options: Required<Pick<CreateAmirielEditorOptions, "accept" | "showGithubLink" | "githubUrl" | "paperResizable" | "readOnly">> & CreateAmirielEditorOptions;
  private root: HTMLElement;
  private value: AmirielDocument;
  private selectedPageId = "";
  private uploadBusy = false;
  private uploadError = "";
  private fileInput: HTMLInputElement | null = null;
  private previewHost: HTMLElement | null = null;
  private previewRenderer: AmirielBodyRendererHandle | null = null;
  private lightbox: AmirielMediaLightbox | null = null;
  private focusBlockId = "";

  constructor(host: HTMLElement, options: CreateAmirielEditorOptions = {}) {
    this.host = host;
    this.options = {
      locale: "en",
      accept: "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime",
      showGithubLink: true,
      githubUrl: DEFAULT_GITHUB_URL,
      paperResizable: true,
      readOnly: false,
      ...options,
    };
    this.value = normalizeDocument(options.value ?? { theme: "midnight", media: [], pages: [] }, this.normalizeOptions());
    this.selectedPageId = this.value.pages[0]?.id ?? "";
    this.root = el("section");
    clearElement(host);
    host.append(this.root);
    this.render();
  }

  getDocument() {
    return normalizeDocument(this.value, this.normalizeOptions());
  }

  setDocument(value: AmirielDocument) {
    this.value = normalizeDocument(value, this.normalizeOptions());
    if (!this.value.pages.some((page) => page.id === this.selectedPageId)) {
      this.selectedPageId = this.value.pages[0]?.id ?? "";
    }
    this.render();
  }

  setReadOnly(readOnly: boolean) {
    this.options.readOnly = readOnly;
    this.render();
  }

  destroy() {
    this.previewRenderer?.destroy();
    this.lightbox?.destroy();
    clearElement(this.host);
  }

  private normalizeOptions() {
    return {
      defaultPaperSize: this.options.defaultPaperSize,
      paperSizeLimits: this.options.paperSizeLimits,
      paperResizable: this.options.paperResizable,
    };
  }

  private draft() {
    return normalizeDocument(this.value, this.normalizeOptions());
  }

  private resolvedLabels() {
    return resolveAmirielLabels(this.options.locale, this.options.labels);
  }

  private resolvedThemes() {
    return mergeAmirielThemeDefinitions(this.options.themes);
  }

  private resolvedLimits() {
    return {
      maxPages: this.options.limits?.maxPages ?? 20,
      maxTextBlocksPerPage: this.options.limits?.maxTextBlocksPerPage ?? 4,
      maxImages: this.options.limits?.maxImages ?? 3,
      maxVideos: this.options.limits?.maxVideos ?? 1,
    };
  }

  private label(template: string, values: Record<string, string | number>) {
    return formatAmirielLabel(template, values);
  }

  private commit(updater: (next: AmirielDocument) => void, nextSelectedPageId?: string) {
    const next = normalizeDocument(this.value, this.normalizeOptions());
    updater(next);
    this.value = normalizeDocument(next, this.normalizeOptions());
    this.options.onChange?.(this.getDocument());
    if (nextSelectedPageId) this.selectedPageId = nextSelectedPageId;
    this.render();
  }

  private pageHasMedia(page: AmirielPage | undefined, mediaId: string) {
    return Boolean(page?.mediaPlacements?.some((placement) => placement.mediaId === mediaId));
  }

  private selectTheme(themeId: string) {
    if (this.options.readOnly) return;
    this.commit((next) => {
      next.theme = themeId;
      for (const page of next.pages) {
        for (const block of page.textBlocks ?? []) {
          if (!block.color) block.color = themeDefaultTextColorFor(themeId, this.options.themes);
        }
      }
    });
  }

  private updatePaperDimension(dimension: PaperDimension, raw: number) {
    if (this.options.readOnly || !this.options.paperResizable) return;
    if (!Number.isFinite(raw)) return;
    const limits = normalizePaperSizeLimits(this.options.paperSizeLimits);
    const draft = this.draft();
    const activePaperSize = normalizePaperSize(draft.paper, this.normalizeOptions());
    const min = dimension === "width" ? limits.minWidth : limits.minHeight;
    const max = dimension === "width" ? limits.maxWidth : limits.maxHeight;
    this.commit((next) => {
      next.paper = normalizePaperSize({
        ...activePaperSize,
        [dimension]: Math.min(max, Math.max(min, raw)),
      }, this.normalizeOptions());
    });
  }

  private addPage() {
    if (this.options.readOnly || this.draft().pages.length >= this.resolvedLimits().maxPages) return;
    const pageId = createAmirielId("page");
    this.commit((next) => {
      next.pages.push({
        id: pageId,
        order: next.pages.length,
        text: "",
        font: "handwritten",
        mediaIds: [],
        mediaPlacements: [],
        textBlocks: [],
      });
    }, pageId);
  }

  private removeSelectedPage(selectedPage: AmirielPage, selectedPageIndex: number) {
    if (this.options.readOnly || this.draft().pages.length <= 1) return;
    let nextSelectedId = "";
    this.commit((next) => {
      next.pages = next.pages
        .filter((page) => page.id !== selectedPage.id)
        .map((page, index) => ({ ...page, order: index }));
      nextSelectedId = next.pages[Math.max(selectedPageIndex - 1, 0)]?.id ?? next.pages[0]?.id ?? "";
    }, nextSelectedId);
  }

  private addTextBlock(selectedPage: AmirielPage) {
    if (this.options.readOnly) return;
    if ((selectedPage.textBlocks ?? []).length >= this.resolvedLimits().maxTextBlocksPerPage) return;
    this.commit((next) => {
      const page = next.pages.find((item) => item.id === selectedPage.id);
      if (!page) return;
      const block: AmirielTextBlock = {
        id: createAmirielId("text"),
        x: 8,
        y: 18 + (page.textBlocks ?? []).length * 10,
        width: 56,
        height: 18,
        text: "",
        z: nextZ(page),
        font: page.font || "handwritten",
        fontSize: 16,
        color: themeDefaultTextColorFor(next.theme, this.options.themes),
      };
      page.textBlocks = [...(page.textBlocks ?? []), block];
      syncPageText(page);
    });
  }

  private updateTextBlock(selectedPage: AmirielPage, blockId: string, updater: (block: AmirielTextBlock) => void) {
    if (this.options.readOnly) return;
    this.focusBlockId = blockId;
    this.commit((next) => {
      const page = next.pages.find((item) => item.id === selectedPage.id);
      const block = page?.textBlocks?.find((item) => item.id === blockId);
      if (!page || !block) return;
      updater(block);
      syncPageText(page);
    });
  }

  private removeTextBlock(selectedPage: AmirielPage, blockId: string) {
    if (this.options.readOnly) return;
    this.commit((next) => {
      const page = next.pages.find((item) => item.id === selectedPage.id);
      if (!page) return;
      page.textBlocks = (page.textBlocks ?? []).filter((block) => block.id !== blockId);
      syncPageText(page);
    });
  }

  private updatePageFont(selectedPage: AmirielPage, font: AmirielFont) {
    if (this.options.readOnly) return;
    this.commit((next) => {
      const page = next.pages.find((item) => item.id === selectedPage.id);
      if (page) page.font = font;
    });
  }

  private toggleMediaOnPage(selectedPage: AmirielPage, mediaId: string) {
    if (this.pageHasMedia(selectedPage, mediaId)) {
      this.detachMediaFromSelectedPage(selectedPage, mediaId);
      return;
    }
    this.addMediaToSelectedPage(selectedPage, mediaId);
  }

  private addMediaToSelectedPage(selectedPage: AmirielPage, mediaId: string) {
    if (this.options.readOnly) return;
    const draft = this.draft();
    const activePaperSize = normalizePaperSize(draft.paper, this.normalizeOptions());
    this.commit((next) => {
      const page = next.pages.find((item) => item.id === selectedPage.id);
      const media = next.media.find((item) => item.id === mediaId);
      if (!page || !media || this.pageHasMedia(page, mediaId)) return;
      const aspectRatio = mediaAspectRatio(media);
      const z = nextZ(page);
      const offset = (z - 1) % 6;
      const x = 10 + (offset % 3) * 8;
      const y = 24 + Math.floor(offset / 3) * 8;
      const size = mediaSizeWithinPaper(38, aspectRatio, activePaperSize.width, activePaperSize.height, 100 - x, 100 - y);
      const placement: AmirielMediaPlacement = {
        id: createAmirielId("placement"),
        mediaId,
        x,
        y,
        width: size.width,
        height: size.height,
        aspectRatio,
        z,
      };
      page.mediaPlacements = [...(page.mediaPlacements ?? []), placement];
      syncPageMediaIds(page);
    });
  }

  private detachMediaFromSelectedPage(selectedPage: AmirielPage, mediaId: string) {
    if (this.options.readOnly) return;
    this.commit((next) => {
      const page = next.pages.find((item) => item.id === selectedPage.id);
      if (!page) return;
      page.mediaPlacements = (page.mediaPlacements ?? []).filter((placement) => placement.mediaId !== mediaId);
      syncPageMediaIds(page);
    });
  }

  private removeMedia(id: string) {
    if (this.options.readOnly) return;
    const removed = this.draft().media.find((item) => item.id === id);
    this.commit((next) => {
      next.media = next.media.filter((item) => item.id !== id);
      next.pages = next.pages.map((page) => ({
        ...page,
        mediaIds: (page.mediaIds ?? []).filter((mediaId) => mediaId !== id),
        mediaPlacements: (page.mediaPlacements ?? []).filter((placement) => placement.mediaId !== id),
      }));
    });
    if (removed) this.options.onMediaRemoved?.(removed);
  }

  private async onMediaSelected(file: File, selectedPage: AmirielPage) {
    const labels = this.resolvedLabels();
    const limits = this.resolvedLimits();
    const draft = this.draft();
    const mediaCounts = {
      images: draft.media.filter((item) => item.type === "image").length,
      videos: draft.media.filter((item) => item.type === "video").length,
    };
    const uploadLimitReached = mediaCounts.images >= limits.maxImages && mediaCounts.videos >= limits.maxVideos;

    if (!file || this.options.readOnly || this.uploadBusy || uploadLimitReached) return;
    if (file.type.startsWith("image/") && mediaCounts.images >= limits.maxImages) return;
    if (file.type.startsWith("video/") && mediaCounts.videos >= limits.maxVideos) return;

    this.uploadBusy = true;
    this.uploadError = "";
    this.render();

    try {
      if (!this.options.onMediaRequest) throw new Error(labels.mediaUploadMissing);
      const media = await new Promise<AmirielMedia>((resolve, reject) => {
        const request: AmirielMediaRequest<File> = {
          file,
          pageId: selectedPage.id,
          resolve,
          reject: (message?: string) => reject(new Error(message || labels.uploadFailed)),
        };
        Promise.resolve(this.options.onMediaRequest?.(request)).catch(reject);
        queueMicrotask(() => {
          if (!request.handled) reject(new Error(labels.mediaUploadMissing));
        });
      });

      const activePaperSize = normalizePaperSize(this.draft().paper, this.normalizeOptions());
      this.commit((next) => {
        next.media.push(media);
        const page = next.pages.find((item) => item.id === selectedPage.id);
        if (!page || this.pageHasMedia(page, media.id)) return;
        const aspectRatio = mediaAspectRatio(media);
        const z = nextZ(page);
        const offset = (z - 1) % 6;
        const x = 10 + (offset % 3) * 8;
        const y = 24 + Math.floor(offset / 3) * 8;
        const size = mediaSizeWithinPaper(38, aspectRatio, activePaperSize.width, activePaperSize.height, 100 - x, 100 - y);
        page.mediaPlacements = [...(page.mediaPlacements ?? []), {
          id: createAmirielId("placement"),
          mediaId: media.id,
          x,
          y,
          width: size.width,
          height: size.height,
          aspectRatio,
          z,
        }];
        syncPageMediaIds(page);
      });
    } catch (error) {
      this.uploadError = error instanceof Error ? error.message : labels.uploadFailed;
      this.render();
    } finally {
      this.uploadBusy = false;
      this.render();
    }
  }

  private openLightbox(media: AmirielMedia) {
    if (!this.lightbox) {
      this.lightbox = new AmirielMediaLightbox({ onClose: () => this.lightbox?.close() });
      this.lightbox.mount(this.root);
    }
    const labels = this.resolvedLabels();
    this.lightbox.open(media, {
      closeLabel: labels.close,
      imageLabel: labels.image,
      videoLabel: labels.video,
    });
  }

  private render() {
    const draft = this.draft();
    const labels = this.resolvedLabels();
    const themes = this.resolvedThemes();
    const limits = this.resolvedLimits();
    const {
      readOnly = false,
      paperResizable = true,
      showGithubLink = true,
      githubUrl = DEFAULT_GITHUB_URL,
      accept,
      className,
      locale,
      labels: labelOverrides,
      themes: themeOverrides,
      defaultPaperSize,
      paperSizeLimits,
    } = this.options;

    const activePaperSize = normalizePaperSize(draft.paper, this.normalizeOptions());
    const activePaperSizeLimits = normalizePaperSizeLimits(paperSizeLimits);
    const activeThemeStyle = amirielThemeCssVars(findAmirielThemeDefinition(draft.theme, themeOverrides));
    const selectedPage = draft.pages.find((page) => page.id === this.selectedPageId) ?? draft.pages[0];
    const selectedPageIndex = Math.max(0, draft.pages.findIndex((page) => page.id === selectedPage?.id));
    const mediaCounts = {
      images: draft.media.filter((item) => item.type === "image").length,
      videos: draft.media.filter((item) => item.type === "video").length,
    };
    const pageLimitReached = draft.pages.length >= limits.maxPages;
    const uploadLimitReached = mediaCounts.images >= limits.maxImages && mediaCounts.videos >= limits.maxVideos;

    this.root.className = ["amiriel-vanilla-editor", className].filter(Boolean).join(" ");
    Object.assign(this.root.style, activeThemeStyle as Partial<CSSStyleDeclaration>);
    clearElement(this.root);

    const pagesBar = el("div", { className: "amiriel-vanilla-editor__pages", ariaLabel: labels.pagesCount });
    for (const [index, page] of draft.pages.entries()) {
      pagesBar.append(el("button", {
        type: "button",
        className: page.id === selectedPage?.id ? "is-active" : "",
        textContent: String(index + 1),
        onclick: () => {
          this.selectedPageId = page.id;
          this.render();
        },
      }));
    }
    if (!readOnly) {
      pagesBar.append(el("button", {
        type: "button",
        textContent: "+",
        disabled: pageLimitReached,
        onclick: () => this.addPage(),
      }));
    }

    const themesBar = el("div", { className: "amiriel-vanilla-editor__themes", ariaLabel: labels.themeLabel });
    for (const theme of themes) {
      themesBar.append(el("button", {
        type: "button",
        className: draft.theme === theme.id ? "is-active" : "",
        title: theme.label || labels.themes[theme.id] || theme.id,
        disabled: readOnly,
        onclick: () => this.selectTheme(theme.id),
      }, el("span", {
        className: "amiriel-vanilla-editor__swatch",
        style: { background: theme.swatch },
      }), el("span", { textContent: theme.label || labels.themes[theme.id] || theme.id })));
    }

    this.root.append(el("div", { className: "amiriel-vanilla-editor__bar" }, pagesBar, themesBar));

    this.previewHost = el("div", { className: "amiriel-vanilla-editor__preview" });
    const side = el("aside", { className: "amiriel-vanilla-editor__side" });

    if (selectedPage) {
      const pagePanel = el("section", { className: "amiriel-vanilla-editor__panel" });
      const pageHead = el("div", { className: "amiriel-vanilla-editor__panel-head" }, el("h3", {
        textContent: this.label(labels.pagesCount, { count: draft.pages.length, max: limits.maxPages }),
      }));
      if (!readOnly && draft.pages.length > 1) {
        pageHead.append(el("button", {
          type: "button",
          className: "is-danger",
          textContent: labels.removePage,
          onclick: () => this.removeSelectedPage(selectedPage, selectedPageIndex),
        }));
      }
      pagePanel.append(pageHead);

      pagePanel.append(el("label", { className: "amiriel-vanilla-editor__field" },
        el("span", { textContent: labels.textBlockFont }),
        el("select", {
          value: selectedPage.font || "handwritten",
          disabled: readOnly,
          onchange: (event) => this.updatePageFont(selectedPage, (event.currentTarget as HTMLSelectElement).value as AmirielFont),
        }, ...AMIRIEL_FONT_OPTIONS.map((font) => el("option", { value: font, textContent: labels.fonts[font] }))),
      ));

      if (paperResizable) {
        pagePanel.append(el("div", { className: "amiriel-vanilla-editor__paper-fields" },
          el("label", { className: "amiriel-vanilla-editor__field" },
            el("span", { textContent: labels.paperWidth }),
            el("input", {
              type: "number",
              min: String(activePaperSizeLimits.minWidth),
              max: String(activePaperSizeLimits.maxWidth),
              value: String(activePaperSize.width),
              disabled: readOnly,
              onchange: (event) => this.updatePaperDimension("width", Number((event.currentTarget as HTMLInputElement).value)),
            }),
          ),
          el("label", { className: "amiriel-vanilla-editor__field" },
            el("span", { textContent: labels.paperHeight }),
            el("input", {
              type: "number",
              min: String(activePaperSizeLimits.minHeight),
              max: String(activePaperSizeLimits.maxHeight),
              value: String(activePaperSize.height),
              disabled: readOnly,
              onchange: (event) => this.updatePaperDimension("height", Number((event.currentTarget as HTMLInputElement).value)),
            }),
          ),
        ));
      }
      side.append(pagePanel);
    }

    const textPanel = el("section", { className: "amiriel-vanilla-editor__panel" });
    const textHead = el("div", { className: "amiriel-vanilla-editor__panel-head" }, el("h3", {
      textContent: this.label(labels.textBlockLimit, { count: selectedPage?.textBlocks?.length ?? 0, max: limits.maxTextBlocksPerPage }),
    }));
    if (!readOnly) {
      textHead.append(el("button", {
        type: "button",
        textContent: labels.addTextBlock,
        disabled: !selectedPage || (selectedPage.textBlocks?.length ?? 0) >= limits.maxTextBlocksPerPage,
        onclick: () => selectedPage && this.addTextBlock(selectedPage),
      }));
    }
    textPanel.append(textHead);

    const blocks = selectedPage?.textBlocks ?? [];
    if (blocks.length) {
      const blocksHost = el("div", { className: "amiriel-vanilla-editor__blocks" });
      for (const block of blocks) {
        const blockRoot = el("div", { className: "amiriel-vanilla-editor__block" });
        const textarea = el("textarea", {
          value: block.text,
          placeholder: labels.textBlockPlaceholder,
          readOnly,
          oninput: (event) => this.updateTextBlock(selectedPage!, block.id, (next) => {
            next.text = (event.currentTarget as HTMLTextAreaElement).value;
          }),
        }) as HTMLTextAreaElement;
        textarea.dataset.blockId = block.id;
        blockRoot.append(textarea);

        const tools = el("div", { className: "amiriel-vanilla-editor__block-tools" });
        tools.append(
          el("select", {
            value: block.font || selectedPage?.font || "handwritten",
            disabled: readOnly,
            ariaLabel: labels.textBlockFont,
            onchange: (event) => this.updateTextBlock(selectedPage!, block.id, (next) => {
              next.font = (event.currentTarget as HTMLSelectElement).value as AmirielFont;
            }),
          }, ...AMIRIEL_FONT_OPTIONS.map((font) => el("option", { value: font, textContent: labels.fonts[font] }))),
          el("input", {
            type: "number",
            min: "10",
            max: "48",
            value: String(block.fontSize || 16),
            disabled: readOnly,
            ariaLabel: labels.textBlockFontSize,
            onchange: (event) => this.updateTextBlock(selectedPage!, block.id, (next) => {
              next.fontSize = Number((event.currentTarget as HTMLInputElement).value) || 16;
            }),
          }),
          el("select", {
            value: block.color || themeDefaultTextColorFor(draft.theme, themeOverrides),
            disabled: readOnly,
            ariaLabel: labels.textBlockColor,
            onchange: (event) => this.updateTextBlock(selectedPage!, block.id, (next) => {
              next.color = (event.currentTarget as HTMLSelectElement).value as AmirielTextColor;
            }),
          }, ...AMIRIEL_TEXT_COLOR_OPTIONS.map((color) => el("option", { value: color, textContent: color }))),
          el("button", {
            type: "button",
            className: block.bold ? "is-active" : "",
            disabled: readOnly,
            textContent: "B",
            onclick: () => this.updateTextBlock(selectedPage!, block.id, (next) => { next.bold = !next.bold; }),
          }),
          el("button", {
            type: "button",
            className: block.italic ? "is-active" : "",
            disabled: readOnly,
            textContent: "I",
            onclick: () => this.updateTextBlock(selectedPage!, block.id, (next) => { next.italic = !next.italic; }),
          }),
          el("button", {
            type: "button",
            className: block.underline ? "is-active" : "",
            disabled: readOnly,
            textContent: "U",
            onclick: () => this.updateTextBlock(selectedPage!, block.id, (next) => { next.underline = !next.underline; }),
          }),
        );

        if (!readOnly && showGithubLink) {
          tools.append(el("a", {
            href: githubUrl,
            target: "_blank",
            rel: "noopener noreferrer",
            className: "amiriel-vanilla-editor__github-link",
            ariaLabel: labels.viewOnGithub,
            title: labels.viewOnGithub,
          }, createGithubMarkIcon()));
        }

        if (!readOnly) {
          tools.append(el("button", {
            type: "button",
            className: "is-danger",
            textContent: labels.deleteTextBlock,
            onclick: () => this.removeTextBlock(selectedPage!, block.id),
          }));
        }

        blockRoot.append(tools);
        blocksHost.append(blockRoot);
      }
      textPanel.append(blocksHost);
    } else {
      textPanel.append(el("p", { className: "amiriel-vanilla-editor__empty", textContent: labels.tapPaperHint }));
    }
    side.append(textPanel);

    const mediaPanel = el("section", { className: "amiriel-vanilla-editor__panel" });
    const mediaHead = el("div", { className: "amiriel-vanilla-editor__panel-head" }, el("h3", { textContent: labels.allMediaTitle }));
    this.fileInput = el("input", { type: "file", accept, hidden: true }) as HTMLInputElement;
    if (!readOnly) {
      mediaHead.append(el("button", {
        type: "button",
        textContent: this.uploadBusy ? labels.uploading : labels.uploadMedia,
        disabled: this.uploadBusy || uploadLimitReached,
        onclick: () => this.fileInput?.click(),
      }));
      this.fileInput.onchange = () => {
        const file = this.fileInput?.files?.[0];
        if (this.fileInput) this.fileInput.value = "";
        if (file && selectedPage) void this.onMediaSelected(file, selectedPage);
      };
      mediaHead.append(this.fileInput);
    }
    mediaPanel.append(mediaHead);
    mediaPanel.append(el("div", { className: "amiriel-vanilla-editor__stats" },
      el("span", { textContent: this.label(labels.imageQuota, { count: mediaCounts.images, max: limits.maxImages }) }),
      el("span", { textContent: this.label(labels.videoQuota, { count: mediaCounts.videos, max: limits.maxVideos }) }),
    ));
    if (this.uploadError) {
      mediaPanel.append(el("p", { className: "amiriel-vanilla-editor__error", textContent: this.uploadError }));
    }

    if (draft.media.length) {
      const grid = el("div", { className: "amiriel-vanilla-editor__media-grid" });
      for (const item of draft.media) {
        const tile = el("div", {
          className: this.pageHasMedia(selectedPage, item.id)
            ? "amiriel-vanilla-editor__media-tile is-on-page"
            : "amiriel-vanilla-editor__media-tile",
        });
        const preview = el("button", {
          type: "button",
          className: "amiriel-vanilla-editor__media-preview",
          onclick: () => this.openLightbox(item),
        });
        if (item.type === "image") {
          preview.append(el("img", { src: mediaThumbnail(item), alt: item.objectKey || labels.image }));
        } else {
          preview.append(createAmirielMediaVideo({ media: item, showDurationBadge: true, muted: true, preload: "metadata" }));
        }
        tile.append(preview);
        if (!readOnly) {
          tile.append(el("div", { className: "amiriel-vanilla-editor__tile-actions" },
            el("button", {
              type: "button",
              textContent: this.pageHasMedia(selectedPage, item.id) ? "-" : "+",
              onclick: () => selectedPage && this.toggleMediaOnPage(selectedPage, item.id),
            }),
            el("button", {
              type: "button",
              className: "is-danger",
              textContent: "x",
              onclick: () => this.removeMedia(item.id),
            }),
          ));
        }
        grid.append(tile);
      }
      mediaPanel.append(grid);
    } else {
      mediaPanel.append(el("p", { className: "amiriel-vanilla-editor__empty", textContent: labels.mediaEmpty }));
    }
    side.append(mediaPanel);

    this.root.append(el("div", { className: "amiriel-vanilla-editor__layout" },
      el("div", { className: "amiriel-vanilla-editor__workspace" }, this.previewHost),
      side,
    ));

    this.previewRenderer?.destroy();
    this.previewRenderer = createAmirielBodyRenderer(this.previewHost, {
      document: draft,
      pageIndex: selectedPageIndex,
      locale,
      labels: labelOverrides,
      themes: themeOverrides,
      interactive: true,
      defaultPaperSize,
      paperSizeLimits,
      paperResizable,
    });

    if (this.focusBlockId) {
      const textarea = this.root.querySelector(`textarea[data-block-id="${this.focusBlockId}"]`) as HTMLTextAreaElement | null;
      textarea?.focus();
      const end = textarea?.value.length ?? 0;
      textarea?.setSelectionRange(end, end);
    }
  }
}

export function createAmirielEditor(host: HTMLElement, options: CreateAmirielEditorOptions = {}): AmirielEditorHandle {
  return new AmirielBodyEditorImpl(host, options);
}

export class AmirielBodyEditorElement extends HTMLElement {
  private handle: AmirielEditorHandle | null = null;

  connectedCallback() {
    if (this.handle) return;
    this.handle = createAmirielEditor(this, {
      locale: (this.getAttribute("locale") as AmirielLocale | null) ?? undefined,
      readOnly: this.hasAttribute("readonly"),
      showGithubLink: !this.hasAttribute("hide-github-link"),
      githubUrl: this.getAttribute("github-url") ?? undefined,
    });
  }

  disconnectedCallback() {
    this.handle?.destroy();
    this.handle = null;
  }

  getDocument() {
    return this.handle?.getDocument();
  }

  setDocument(value: AmirielDocument) {
    this.handle?.setDocument(value);
  }
}

export function defineAmirielElements() {
  if (typeof customElements === "undefined") return;
  if (customElements.get("amiriel-body-editor")) return;
  customElements.define("amiriel-body-editor", AmirielBodyEditorElement);
}
