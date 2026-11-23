# Contributing to Tinnitus Relief Studio

Thank you for your interest in contributing to **Tinnitus Relief Studio**! Contributions of all kinds — bug fixes, DSP improvements, accessibility enhancements, tests, and documentation — are welcome.

## Getting Started

1. Fork the repository and clone your fork:
   ```bash
   git clone https://github.com/<your-username>/tinnitus-relief-studio.git
   cd tinnitus-relief-studio
   ```
2. Install dependencies (Node.js 18+):
   ```bash
   npm install
   ```
3. Start the local dev server:
   ```bash
   npm run dev
   ```
4. Verify TypeScript typechecking and the production build before committing:
   ```bash
   npm run build
   ```

## Audio Safety & Scientific Accuracy Guidelines

Because this tool generates real-time audio intended for people who experience tinnitus, all contributions must preserve these invariants:

- **No autoplay:** Audio must only start in direct response to an explicit user gesture.
- **Safe defaults & smooth transitions:** Never raise the master volume automatically, respect the user's `maxVolume` software cap, and ramp gain/parameter changes smoothly to avoid pops, clicks, or sudden loudness spikes.
- **Immediate silence:** The **Stop** button and `Esc` panic shortcut must always silence playback immediately.
- **Honest medical framing:** Never make clinical, diagnostic, or curative claims. Keep disclaimers accurate — especially around experimental features like phase inversion and notched noise.

## Submitting a Pull Request

1. Check [open issues](https://github.com/atmtrujillo/tinnitus-relief-studio/issues) first (or open one to discuss larger changes).
2. Create a descriptive branch from `main` (e.g., `fix/panic-stop-fadeout` or `feat/break-reminder`).
3. Keep pull requests focused and include verification notes (browser tested, `npm run build` passing).
4. Reference any related issue in the PR description (e.g., `Closes #1`).

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
