<p align="center">
  <img src="https://amiriel.com/logo/amiriel_256x256.webp" alt="Amiriel logo" width="96" height="96" />
</p>

<h1 align="center">Amiriel Vanilla</h1>

<p align="center">
  Vanilla JavaScript editor and renderer for Amiriel letter documents.
</p>

`@amiriel/vanilla` provides a framework-free implementation of the Amiriel document
renderer and editor shell. It is built on `@amiriel/core`, so the document model, themes,
labels, and normalization rules stay aligned with the Vue and React packages.

[![npm version (beta)](https://img.shields.io/npm/v/@amiriel/vanilla/beta?style=flat-square)](https://www.npmjs.com/package/@amiriel/vanilla)
[![license](https://img.shields.io/npm/l/@amiriel/vanilla?style=flat-square)](https://www.npmjs.com/package/@amiriel/vanilla)
[![TypeScript](https://img.shields.io/badge/typescript-ready-3178C6?style=flat-square&logo=typescript&logoColor=white)]()

The full hosted product lives at [amiriel.com](https://amiriel.com).

## Features

- Vanilla JS read-only renderer for Amiriel documents
- Imperative editor API for pages, themes, text blocks, paper size, and media list
- Optional `<amiriel-body-editor>` custom element
- Image/video media lightbox
- Shared document model from `@amiriel/core`
- TypeScript declarations

The current Vanilla editor matches the React shell feature set. Advanced parity with
the Vue editor, such as drag-and-drop placement and resize handles, should be added
incrementally.

## Install

```bash
npm install @amiriel/vanilla@beta
pnpm add @amiriel/vanilla@beta
yarn add @amiriel/vanilla@beta
bun add @amiriel/vanilla@beta
```

Import the stylesheet once:

```html
<link rel="stylesheet" href="/node_modules/@amiriel/vanilla/dist/style.css" />
```

```js
import "@amiriel/vanilla/style.css";
```

## Usage

### Imperative API

```html
<div id="editor"></div>
<script type="module">
  import { createAmirielEditor } from "@amiriel/vanilla";
  import "@amiriel/vanilla/style.css";

  const editor = createAmirielEditor(document.getElementById("editor"), {
    locale: "zh",
    showGithubLink: true,
    onChange(document) {
      console.log(document);
    },
    async onMediaRequest(request) {
      request.handled = true;
      try {
        const media = await uploadMediaSomewhere(request.file);
        request.resolve(media);
      } catch (error) {
        request.reject(error instanceof Error ? error.message : "Upload failed");
      }
    },
  });

  editor.setDocument({
    theme: "midnight",
    media: [],
    pages: [],
  });
</script>
```

### Custom element

```html
<link rel="stylesheet" href="/node_modules/@amiriel/vanilla/dist/style.css" />
<amiriel-body-editor locale="en"></amiriel-body-editor>
<script type="module">
  import { defineAmirielElements } from "@amiriel/vanilla";
  defineAmirielElements();
</script>
```

### Read-only renderer

```js
import { createAmirielBodyRenderer } from "@amiriel/vanilla";
import "@amiriel/vanilla/style.css";

const renderer = createAmirielBodyRenderer(document.getElementById("preview"), {
  document: myDocument,
  locale: "en",
});

renderer.update({ pageIndex: 1 });
```

Host applications own media upload and pass the resulting media object back
through `request.resolve(media)`.

## Main Exports

| Export | Description |
| --- | --- |
| `createAmirielEditor` | Mount a Vanilla editor into a host element |
| `createAmirielBodyRenderer` | Mount a read-only renderer |
| `defineAmirielElements` | Register `<amiriel-body-editor>` |
| `AmirielBodyEditorElement` | Custom element class |
| Core types and helpers | Re-exported from `@amiriel/core` |

## Editor Options

| Option | Default | Description |
| --- | --- | --- |
| `value` | empty document | Initial document value |
| `onChange` | none | Called when the document changes |
| `readOnly` | `false` | Render the editor shell without editing controls |
| `locale` | `"en"` | Built-in label locale: `en` or `zh` |
| `labels` | none | Partial override for UI labels |
| `themes` | none | Override built-in themes or register custom paper themes |
| `showGithubLink` | `true` | Show GitHub link on the text-block toolbar |
| `githubUrl` | `https://github.com/Amirieljs/Amiriel-Vanilla` | Target URL for the GitHub button |
| `defaultPaperSize` | `{ width: 720, height: 520 }` | Fallback paper size |
| `paperSizeLimits` | core defaults | Paper resizing bounds |
| `paperResizable` | `true` | Allow users to edit paper width and height |
| `onMediaRequest` | none | Host-controlled upload hook for new media files |
| `onMediaRemoved` | none | Called when the user removes media from the document |

## Package Architecture

This repository is the Vanilla JavaScript implementation. The shared framework-agnostic
core lives in [`@amiriel/core`](https://github.com/Amirieljs/Amiriel-Core), the meta package
[`amiriel`](https://github.com/Amirieljs/Amiriel) re-exports it, the Vue
implementation lives in [`@amiriel/vue`](https://github.com/Amirieljs/Amiriel-Vue),
and the React implementation lives in
[`@amiriel/react`](https://github.com/Amirieljs/Amiriel-React).

## License

MIT. The Vanilla editor package is open source and can be used commercially. The
official hosted Amiriel product at [amiriel.com](https://amiriel.com) may still
provide paid services around storage, accounts, delivery, hosting, collaboration,
or other product workflows.
