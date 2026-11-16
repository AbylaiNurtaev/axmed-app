# Native store captures

The `Capture App Store screens` workflow builds the app for the iOS Simulator,
signs in normally, and captures Home, Health, Plan, and Profile on an iPhone Pro
Max and a 13-inch iPad Pro. Its simulator-only bracelet stub replaces unsupported
vendor binaries; these captures do not validate Bluetooth hardware.

Before running, configure repository secret `AXMED_PREVIEW_CREDENTIALS` as JSON
with `email` and `password` from a disposable, verified account. Use only
fictional profile information and synthetic goals. Never use the shared Apple
reviewer password, real health data, a database URL, or a signing key here.

The workflow uploads PNG captures as a short-lived artifact. Inspect the images
before placing them in App Store Connect. Remove the disposable account and the
repository secret when finished. The generated UI-test Xcode project embeds its
temporary test credentials and is intentionally ignored by Git.
