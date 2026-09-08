# Stem Keys

A browser stem player: open an MP3, separate vocals/drums/bass/other, then mix with the keyboard. All audio decoding, separation, and playback happen on the user's device. No audio is sent to the server or stored there.

## Visuals

The interface uses royal blue and white, with no permanent text or number labels. Track names and shortcuts appear only in hover hints or on keyboard focus. Controls are icons with accessible labels and shortcut tooltips. Four edge-to-edge WebGL halftone forms—a ribbon, a torus, a sphere, and a folded contour—give each stem its own visual identity, fed by a pre-gain AnalyserNode: logarithmic frequency bands drive dot size and the live waveform shapes the field. Muted stems keep reacting to their own frequencies at reduced brightness; enabling a stem lights it up. Volume and mute only affect the audio gain, so all four visuals follow the song throughout playback. Paused visuals freeze. Reduced-motion settings use static halftones, and browsers without WebGL get a CSS dot fallback. The renderer runs entirely in the browser.

## Controls

- Space: play/pause (except the file chooser and native input controls).
- 1–4: toggle vocals, drums, bass, and other.
- Hold Shift and press 1, 2, 3: select those three stems and start them together. Repeat a shifted number to remove it; removing the last member restores the previous mix. Shift-click works too.
- 0: reset all stems and volumes.
- R: return to the beginning.
- Sliders: individual volume (revealed on hover/focus; always available on touch) and playback position.

## Run

Node 22.13+ and npm. Run `npm ci`, then `npm run dev`.
`npm run build` creates the Sites deployment. For browser verification use `npm run build` followed by `npm run start -- --port 3000`; the production preview avoids the development runtime injecting window-only hot-reload code into audio workers. The project identity is in `.openai/hosting.json`.

## Separation

A module worker uses HTDemucs with ONNX Runtime Web 1.23.0. The 172 MiB model is downloaded from a pinned Hugging Face revision and cached using the browser Cache API. The runtime loads its WASM support from the versioned jsDelivr CDN. Network access to both hosts is needed on first use; browser storage restrictions can cause a later re-download.

The worker tries WebGPU first and falls back to single-threaded WASM if GPU initialization or inference fails. Single-threaded WASM requires no cross-origin isolation. CPU processing may take longer than the song. Desktop Chrome or Edge is recommended; memory and browser support vary. Inputs are limited to 100 MiB and 10 minutes. Shorter songs use less memory.

Audio is decoded to 44.1 kHz stereo (mono is duplicated). Segments use 25% overlap and weighted blending. Output tensors are disposed per segment. The worker is terminated on cancellation and after completion to release inference memory. Four AudioBufferSourceNodes share one AudioContext start time and offset; gain changes do not restart them. A compressor limits mixed peaks.

Separation code uses the MIT-licensed `demucs-web` spectral helpers. Model source: https://huggingface.co/timcsy/demucs-web-onnx/tree/92e33df61cfc9eb820272aaa62d2ef6dcf4d950d.

## Validation

- `npx tsc --noEmit`
- `node --experimental-strip-types --test tests/audio.test.ts`: shared audio clock, pause/seek/resume, end-of-track, additive group selection, mix/volume restoration, separate visual signals, and cancellation during AudioContext resume.
- Changed product files pass oxlint. The generated, unchanged component catalog has existing lint findings.
- Real 8-second stereo MP3 sample from the upstream Demucs repository: four finite, non-silent stems; exact sample lengths; correct progress across two overlapping sections. Sum reconstruction: 30.77 dB signal-to-error ratio in both native ONNX and ONNX Runtime Web WASM. WASM took about 20 seconds on the development machine; this is not a browser speed guarantee.
- Production build and HTTP route response checked.
- Browser regression check: the reported 2:51, 48 kHz stereo MP3 decoded, completed all 30 separation sections using WebGPU, and reached active playback in the production build. Muted stem state and an advancing playback clock were observed; no browser errors were logged. WebMCP read-back and invalid-input rejection were also checked.
- Worker constructors use Vite’s `?worker` import so the deployed script loads from the site origin. Worker startup errors are reported separately from decoding failures.

## Troubleshooting

If download fails, check access to Hugging Face and jsDelivr and retry. If the tab runs out of memory, use a shorter song or close other heavy tabs. Cancel ends the current worker immediately; choosing the same file again starts a new job. Clearing site storage removes the model cache. The page does not retain songs across reloads.
