# Stem Keys

A browser stem player: open an MP3, separate vocals/drums/bass/other, then mix with the keyboard. All audio decoding, separation, and playback happen on the user's device. No audio is sent to the server or stored there.

## Controls

- Space: play/pause (except the file chooser and native input controls).
- 1–4: toggle vocals, drums, bass, and other.
- Shift + 1–4: solo a stem; repeat to restore the previous mix.
- 0: reset all stems and volumes.
- R: return to the beginning.
- Sliders: individual volume and playback position.

## Run

Node 22.13+ and npm. Run `npm ci`, then `npm run dev`.
`npm run build` creates the Sites deployment. The project identity is in `.openai/hosting.json`.

## Separation

A module worker uses HTDemucs with ONNX Runtime Web 1.23.0. The 172 MiB model is downloaded from a pinned Hugging Face revision and cached using the browser Cache API. The runtime loads its WASM support from the versioned jsDelivr CDN. Network access to both hosts is needed on first use; browser storage restrictions can cause a later re-download.

The worker tries WebGPU first and falls back to single-threaded WASM if GPU initialization or inference fails. Single-threaded WASM requires no cross-origin isolation. CPU processing may take longer than the song. Desktop Chrome or Edge is recommended; memory and browser support vary. Inputs are limited to 100 MiB and 10 minutes. Shorter songs use less memory.

Audio is decoded to 44.1 kHz stereo (mono is duplicated). Segments use 25% overlap and weighted blending. Output tensors are disposed per segment. The worker is terminated on cancellation and after completion to release inference memory. Four AudioBufferSourceNodes share one AudioContext start time and offset; gain changes do not restart them. A compressor limits mixed peaks.

Separation code uses the MIT-licensed `demucs-web` spectral helpers. Model source: https://huggingface.co/timcsy/demucs-web-onnx/tree/92e33df61cfc9eb820272aaa62d2ef6dcf4d950d.

## Validation

- `npx tsc --noEmit`
- `node --experimental-strip-types --test tests/audio.test.ts`: shared audio clock, pause/seek/resume, end-of-track, solo/volume restoration, and cancellation during AudioContext resume.
- Changed product files pass oxlint. The generated, unchanged component catalog has existing lint findings.
- Real 8-second stereo MP3 sample from the upstream Demucs repository: four finite, non-silent stems; exact sample lengths; correct progress across two overlapping sections. Sum reconstruction: 30.77 dB signal-to-error ratio in both native ONNX and ONNX Runtime Web WASM. WASM took about 20 seconds on the development machine; this is not a browser speed guarantee.
- Production build and HTTP route response checked.
- Browser interactions and GPU execution have not been exercised by an automated browser run. Optional WebMCP tools are feature-detected; no live WebMCP validation context was available.

## Troubleshooting

If download fails, check access to Hugging Face and jsDelivr and retry. If the tab runs out of memory, use a shorter song or close other heavy tabs. Cancel ends the current worker immediately; choosing the same file again starts a new job. Clearing site storage removes the model cache. The page does not retain songs across reloads.
