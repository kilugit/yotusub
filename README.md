# YTSub - YouTube SRT Injector

A lightweight, clean Chrome extension (Manifest V3) to inject and synchronize custom SRT, WebVTT, ASS, and SSA subtitles directly into any YouTube video.

## Features

- **Instant Drag & Drop & Paste**: Drop `.srt`, `.vtt`, `.ass`, or `.ssa` files directly onto the YouTube player or popup, or paste URLs / raw subtitle text directly.
- **Precision Timing Sync**: Enter exact timing offsets with live updates, or adjust via quick buttons (+/-0.1s, +/-1.0s) and keyboard shortcuts.
- **Interactive Transcript**: Search dialogue with keyword highlights, smooth active cue tracking, copy transcript to clipboard, and one-click cue alignment (⚡).
- **Export & Copy**: Export synchronized subtitles as `.srt` or copy the full timestamped transcript with one click.
- **Responsive Draggable Subtitles**: Drag subtitles anywhere within player boundaries with proportional scaling across fullscreen and window resizing.
- **Selectable Text**: Select and copy subtitle words on-screen for dictionary lookup and study.
- **Smart Memory**: Automatically saves and restores your loaded subtitles and timing sync per video.
- **Live Styling**: Customize font family, font size, color, background opacity, outline, and placement with instant preview.
- **Ad Awareness**: Automatically hides subtitles while YouTube ads play and resumes them when the video continues.
- **Zero Bloat**: Pure vanilla JavaScript with no external dependencies or tracking.

## Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| <kbd>Alt</kbd> + <kbd>T</kbd> | Toggle subtitles on / off |
| <kbd>Alt</kbd> + <kbd>[</kbd> | Shift subtitles 0.1s earlier |
| <kbd>Alt</kbd> + <kbd>]</kbd> | Shift subtitles 0.1s later |
| <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>[</kbd> | Shift subtitles 1.0s earlier |
| <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>]</kbd> | Shift subtitles 1.0s later |
| <kbd>Alt</kbd> + <kbd>\</kbd> | Reset timing offset to 0.0s |
| <kbd>Alt</kbd> + <kbd>P</kbd> | Jump to previous subtitle cue |
| <kbd>Alt</kbd> + <kbd>N</kbd> | Jump to next subtitle cue |
| <kbd>Alt</kbd> + <kbd>↑</kbd> | Increase font size by 2px |
| <kbd>Alt</kbd> + <kbd>↓</kbd> | Decrease font size by 2px |

## Installation

1. Download or clone this repository.
2. Open your Chromium-based browser (Chrome, Brave, Edge, Opera) and navigate to `chrome://extensions/`.
3. Enable **Developer mode** using the toggle in the top-right corner.
4. Click **Load unpacked** and select the extension directory.
5. Pin **YTSub** to your toolbar for easy access.

## Usage

1. Open any video on [YouTube](https://www.youtube.com).
2. Either:
   - Drag an `.srt`, `.vtt`, `.ass`, or `.ssa` file from your desktop and drop it directly onto the YouTube player.
   - Or click the **YTSub** icon in your toolbar and select a file or paste a subtitle URL.
3. Use the **Sync** buttons or keyboard shortcuts if you need to adjust timing delay.
4. Switch to the **Dialogue** tab to search dialogue and click any line to seek directly to that scene.

## License

MIT License. See [LICENSE](LICENSE) for details.