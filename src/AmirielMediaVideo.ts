import { formatVideoDuration, type AmirielMedia } from "@amiriel/core";
import { el } from "./dom";

export interface AmirielMediaVideoOptions {
  media: AmirielMedia;
  showDurationBadge?: boolean;
  controls?: boolean;
  autoPlay?: boolean;
  muted?: boolean;
  preload?: string;
  className?: string;
}

export function createAmirielMediaVideo(options: AmirielMediaVideoOptions): HTMLElement {
  const {
    media,
    showDurationBadge = false,
    controls,
    autoPlay,
    muted,
    preload,
    className,
  } = options;
  const duration = formatVideoDuration(media.duration ?? 0);
  const root = el("span", {
    className: ["amiriel-media-video", className].filter(Boolean).join(" "),
  }, el("video", {
    src: media.url,
    poster: media.thumbnailUrl,
    controls,
    autoPlay,
    muted,
    preload,
  }));

  if (showDurationBadge && duration) {
    root.append(el("span", { className: "amiriel-media-video__duration", textContent: duration }));
  }

  return root;
}
