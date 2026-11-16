# Native store captures

Build the simulator application with `eas build --platform ios --profile
store-capture`. Put its archive URL in repository secret
`AXMED_SIMULATOR_ARCHIVE_URL` and its SHA-256 in `simulator-build.json` before
running `Capture App Store screens`. The workflow reuses that verified build,
signs in normally, and captures Home, Health, Plan, and Profile on an iPhone Pro
Max and a 13-inch iPad Pro. The simulator-only bracelet stub replaces unsupported
vendor binaries; these captures do not validate Bluetooth hardware.

Before running, configure repository secret `AXMED_PREVIEW_CREDENTIALS` as JSON
with `email` and `password` from a disposable, verified account. Use only
fictional profile information and synthetic goals. Never use the shared Apple
reviewer password, real health data, a database URL, or a signing key here.

The workflow uploads PNG captures as a short-lived artifact. Inspect the images
before placing them in App Store Connect. Remove the disposable account and the
repository secrets when finished. The generated UI-test Xcode project embeds its
temporary test credentials and is intentionally ignored by Git.
