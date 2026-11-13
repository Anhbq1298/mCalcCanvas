# Windows desktop (offline)

The Electron shell packages the same worksheet app and calculation workers as the
web build. All runtime assets are local; HTTP(S) requests are blocked. No server,
Node.js installation or internet connection is needed on the end user's machine.

From this directory, after installing the root project dependencies:

```powershell
npm ci
npm run prepare:app
npm start
npm test
npm run build
```

The portable Windows x64 executable is generated under `offline/release/`.
After a successful build, older versioned portable executables in that directory
are deleted automatically. The current executable and worksheet data are retained;
failed builds do not trigger cleanup.
It is unsigned; this initial packaging has no updater, installer or file association.
Build dependencies require internet access once. Build output is git-ignored.
`npm test` uses a fresh temporary desktop profile. To smoke-test a packaged build,
set `MCCV_DESKTOP_EXECUTABLE` to its absolute executable path before running it.

Desktop autosave uses `%APPDATA%/mCalcCanvas Desktop`, separate from browser data.
Transfer worksheets using `.mCCV` Open/Save As; browser autosaves are not imported
automatically. Keep this data directory when replacing the executable with an update.
The original browser file/download and print workflows are reused; native file
dialog integration and installer signing are future work.
