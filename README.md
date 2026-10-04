# YTSub - YouTube SRT Injector

A lightweight, clean Chrome extension (Manifest V3) to inject and synchronize custom SRT and WebVTT subtitles directly into any YouTube video.

## Features

- **Instant Drag & Drop**: Drop any `.srt` or `.vtt` file directly onto the YouTube video player or into the popup.
- **Real-Time Sync**: Adjust subtitle timing (+/- 0.1s, 0.5s) on the fly via the popup or keyboard shortcuts.
- **Dialogue Search**: Search dialogue across the entire subtitle file and click any cue to jump directly to that timestamp.
- **Draggable Positioning**: Click and drag subtitles anywhere on the video player to avoid covering on-screen content. Double-click to reset.
- **Smart Memory**: Automatically saves and restores your loaded subtitles and timing sync per video.
- **Live Styling**: Customize font size, color, background opacity, outline, and placement (bottom/top) with instant live preview.
- **Ad Awareness**: Automatically hides subtitles while YouTube ads play and resumes them when the video continues.
- **Zero Bloat**: Pure vanilla JavaScript with no external dependencies or tracking.

## Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| <kbd>Alt</kbd> + <kbd>T</kbd> | Toggle subtitles on / off |
| <kbd>Alt</kbd> + <kbd>[</kbd> | Shift subtitles 0.1s earlier |
| <kbd>Alt</kbd> + <kbd>]</kbd> | Shift subtitles 0.1s later |
| <kbd>Alt</kbd> + <kbd>\</kbd> | Reset timing offset to 0.0s |
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
   - Drag an `.srt` or `.vtt` file from your desktop and drop it directly onto the YouTube player.
   - Or click the **YTSub** icon in your toolbar and select a file or paste a subtitle URL.
3. Use the **Sync** buttons or keyboard shortcuts if you need to adjust timing delay.
4. Switch to the **Dialogue** tab to search dialogue and click any line to seek directly to that scene.

## License

MIT License. See [LICENSE](LICENSE) for details.