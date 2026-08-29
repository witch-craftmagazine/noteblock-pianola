import UIKit
import WebKit

/// Serves the bundled `web/` directory under a custom URL scheme instead
/// of `file://`.
///
/// Why: WKWebView assigns `file://` loads a null/opaque origin, and
/// `<script type="module">` fetches are always CORS-mode requests — an
/// opaque origin can never satisfy CORS, so every module script fails to
/// load, silently, with no HTTP status (confirmed on-device: all three of
/// dist/main.js, script.js, and easter-eggs/egg-loader.js failed this
/// way; non-module resources like images/CSS were unaffected). This is
/// the "file://-alternative fallback" flagged in advance by README.md's
/// Phase 0 section — now confirmed necessary, not just theoretical.
///
/// A WKURLSchemeHandler gives the page a real (non-opaque) origin
/// (`Self.scheme://local`), so module scripts, dynamic `import()`, and
/// AudioWorklet's `audioContext.audioWorklet.addModule(...)` (Phase 0's
/// other file:// risk) all work the same way they would over https.
private final class LocalWebSchemeHandler: NSObject, WKURLSchemeHandler {
    private let webDirectory: URL

    init(webDirectory: URL) {
        self.webDirectory = webDirectory
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url else {
            urlSchemeTask.didFailWithError(URLError(.badURL))
            return
        }

        var relativePath = url.path
        if relativePath.hasPrefix("/") { relativePath.removeFirst() }
        if relativePath.isEmpty { relativePath = "index.html" }

        // Defensive: nothing in this app constructs a URL with ".."
        // today, but don't let a future deep-link/query-param path
        // escape webDirectory if that ever changes.
        guard !relativePath.split(separator: "/").contains("..") else {
            respondNotFound(url: url, task: urlSchemeTask)
            return
        }

        let fileURL = webDirectory.appendingPathComponent(relativePath)
        guard let data = try? Data(contentsOf: fileURL) else {
            respondNotFound(url: url, task: urlSchemeTask)
            return
        }

        // Must be an HTTPURLResponse with an explicit 200, not a bare
        // URLResponse — otherwise page-side `fetch()` sees `res.ok ===
        // false` (status 0) even though the bytes arrive fine, which
        // would trip scene.js's `if (!res.ok) throw ...` for musicbox.glb.
        let response = HTTPURLResponse(
            url: url,
            statusCode: 200,
            httpVersion: "HTTP/1.1",
            headerFields: [
                "Content-Type": Self.mimeType(for: fileURL.pathExtension),
                "Content-Length": String(data.count),
            ]
        )!
        urlSchemeTask.didReceive(response)
        urlSchemeTask.didReceive(data)
        urlSchemeTask.didFinish()
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        // Reads are synchronous (Data(contentsOf:)); nothing to cancel.
    }

    private func respondNotFound(url: URL, task: WKURLSchemeTask) {
        let response = HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: nil)!
        task.didReceive(response)
        task.didFinish()
    }

    private static func mimeType(for pathExtension: String) -> String {
        switch pathExtension.lowercased() {
        case "html": return "text/html; charset=utf-8"
        case "js", "mjs": return "application/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "json": return "application/json; charset=utf-8"
        case "glb": return "model/gltf-binary"
        case "sf2": return "application/octet-stream"
        case "mid", "midi": return "audio/midi"
        case "png": return "image/png"
        case "webp": return "image/webp"
        case "svg": return "image/svg+xml"
        case "ico": return "image/x-icon"
        default: return "application/octet-stream"
        }
    }
}

final class MusicBoxViewController: UIViewController {

    // MARK: - Content mode (Phase 2 decision)
    //
    // Flip these two constants to switch from "fully bundled" to
    // "hybrid" without touching anything else in this file. See
    // ios-app-plan.md Phase 2 for the tradeoffs. Nothing else in the
    // app needs to change either way — script.js fetches midilist.json,
    // minecraft3.sf2, and midi/*.mid with plain relative paths, and
    // those resolve the same way whether the base document came from
    // the local scheme (via LocalWebSchemeHandler) or https:// (ordinary
    // same-origin fetch). No NSAppTransportSecurity exception is needed
    // for the remote case either — GitHub Pages is HTTPS-only and ATS
    // allows HTTPS by default.
    private static let useRemoteContent = false
    private static let remoteURL = URL(string: "https://witch-craftmagazine.github.io/noteblock-pianola/")!

    // Custom scheme the bundled content loads under instead of file://.
    // See LocalWebSchemeHandler's doc comment for why file:// doesn't work.
    private static let localScheme = "noteblock-web"
    private static let localOrigin = URL(string: "\(localScheme)://local/")!

    private var webView: WKWebView!
    private let splash = UIView()

    /// Set by AppDelegate before the web view has finished its first
    /// load; applied once didFinish fires. Avoids racing a deep link
    /// against page load.
    private var pendingSongSlug: String?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        let configuration = WKWebViewConfiguration()
        // The app never uses <video>/<audio> elements — sound is raw
        // Web Audio API (AudioContext + AudioWorklet), which isn't
        // gated by this setting. Left at the WebKit default
        // deliberately; nothing to override here.
        configuration.allowsInlineMediaPlayback = true
        installConsoleBridge(into: configuration)
        if !Self.useRemoteContent, let webDir = Bundle.main.url(forResource: "web", withExtension: nil) {
            configuration.setURLSchemeHandler(LocalWebSchemeHandler(webDirectory: webDir), forURLScheme: Self.localScheme)
        }

        webView = WKWebView(frame: view.bounds, configuration: configuration)
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.navigationDelegate = self
        webView.scrollView.bounces = false
        webView.scrollView.isScrollEnabled = false
        // The page opts into edge-to-edge content itself (viewport-fit=cover
        // in index.html) and handles the notch/Dynamic Island/home-indicator
        // safe area with CSS env(safe-area-inset-*) — see styles.css
        // (#github-flap, #sf-toggle, #bg-toggle). Leaving this at the
        // .automatic default would let UIKit *also* try to inset the
        // scroll view for the safe area on top of that, which can shift
        // or clip content unpredictably depending on iOS version. .never
        // makes WebKit the single source of truth for those insets.
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.isOpaque = false
        webView.backgroundColor = .black
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])

        setUpSplash()
        loadContent()
    }

    private func loadContent() {
        if Self.useRemoteContent {
            webView.load(URLRequest(url: Self.remoteURL))
            return
        }

        // Bundled mode: index.html and everything it references
        // (script.js, lib/, midi/, minecraft3.sf2, musicbox.glb, ...)
        // ship inside the app bundle under a top-level "web/" folder
        // staged by CI (see .github/workflows/build.yml), and are served
        // through LocalWebSchemeHandler rather than loadFileURL — see
        // that class's doc comment for why file:// broke module scripts.
        guard
            let webDir = Bundle.main.url(forResource: "web", withExtension: nil),
            FileManager.default.fileExists(atPath: webDir.appendingPathComponent("index.html").path)
        else {
            showLoadFailure(message: "Bundled web/index.html not found. Did CI's staging step run before xcodegen generate?")
            return
        }
        webView.load(URLRequest(url: Self.localOrigin.appendingPathComponent("index.html")))
    }

    // MARK: - Deep linking

    /// Called by AppDelegate for both the custom-scheme and Universal
    /// Link entry points. Reassigning `location.search` inside the
    /// already-loaded page triggers script.js's existing `?song=`
    /// handling (see noteblock-docs.md) — same code path as a normal
    /// browser navigation, no native re-parsing of the web app's
    /// state needed.
    func loadSong(slug: String) {
        guard webViewHasFinishedFirstLoad else {
            pendingSongSlug = slug
            return
        }
        applySongSlug(slug)
    }

    private var webViewHasFinishedFirstLoad = false

    deinit {
        #if DEBUG
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "consoleBridge")
        #endif
    }

    private func applySongSlug(_ slug: String) {
        let encoded = slug.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? slug
        webView.evaluateJavaScript("location.search = '?song=\(encoded)';")
    }

    // MARK: - Console bridge (debug builds only)
    //
    // Native/WebKit logs (Xcode's console) can't see anything that
    // happens *inside* the page — a hung fetch(), a thrown error in
    // scene.js's async IIFE, an unhandled promise rejection. Those only
    // ever show up in Safari's Web Inspector, which is easy to forget
    // to open. This mirrors console.log/warn/error, window.onerror, and
    // unhandledrejection straight into Xcode's console via a
    // WKScriptMessageHandler, so page-side failures are visible in the
    // same place as everything else without a manual attach step.
    private func installConsoleBridge(into configuration: WKWebViewConfiguration) {
        #if DEBUG
        let js = """
        (function () {
          function send(level, args) {
            try {
              window.webkit.messageHandlers.consoleBridge.postMessage({
                level: level,
                message: Array.from(args).map(function (a) {
                  if (a instanceof Error) return a.stack || a.message;
                  try { return typeof a === 'string' ? a : JSON.stringify(a); }
                  catch (e) { return String(a); }
                }).join(' ')
              });
            } catch (e) {}
          }
          ['log', 'warn', 'error'].forEach(function (level) {
            var orig = console[level];
            console[level] = function () {
              send(level, arguments);
              orig.apply(console, arguments);
            };
          });
          // NOTE: resource-load failures (a <script src>, <img>, or
          // fetch()'d file that 404s or is blocked) fire a *non-bubbling*
          // 'error' event targeted at the failing element/window, not a
          // JS exception. A bubble-phase listener (the old 3rd-arg-less
          // addEventListener call this replaced) never sees those, only
          // synchronous script exceptions do — so a bad path on
          // dist/main.js, script.js, or easter-eggs/egg-loader.js could
          // fail completely silently, with no console output at all and
          // the #loading spinner spinning forever. `true` here (capture
          // phase) is what makes window see it.
          window.addEventListener('error', function (e) {
            if (e.target && e.target !== window && (e.target.src || e.target.href)) {
              send('error', ['Resource failed to load: ' + (e.target.tagName || 'element') + ' ' + (e.target.src || e.target.href)]);
              return;
            }
            send('error', [(e.error && (e.error.stack || e.error.message)) || e.message]);
          }, true);
          window.addEventListener('unhandledrejection', function (e) {
            send('error', ['Unhandled promise rejection: ' + ((e.reason && (e.reason.stack || e.reason.message)) || e.reason)]);
          });
          // Sanity checkpoint: if this line never shows up as
          // "[web:log] consoleBridge installed, DOM state: ..." in
          // Xcode's console, the bridge/user script itself isn't
          // running (wrong build config, or injected into the wrong
          // frame) — that's a different bug than anything happening
          // inside script.js/scene.js.
          send('log', ['consoleBridge installed, DOM state: ' + document.readyState]);
        })();
        """
        let script = WKUserScript(source: js, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        configuration.userContentController.addUserScript(script)
        configuration.userContentController.add(self, name: "consoleBridge")
        #endif
    }

    // MARK: - Splash

    private func setUpSplash() {
        splash.backgroundColor = .black
        splash.translatesAutoresizingMaskIntoConstraints = false
        // Swap this for a real launch-image-matching graphic once
        // Phase 3's app icon/launch screen assets exist — this just
        // hides the blank WKWebView flash before index.html's own
        // #loading spinner takes over.
        view.addSubview(splash)
        NSLayoutConstraint.activate([
            splash.topAnchor.constraint(equalTo: view.topAnchor),
            splash.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            splash.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            splash.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])
    }

    private func dismissSplash() {
        guard splash.alpha != 0 else { return }
        UIView.animate(withDuration: 0.25, animations: {
            self.splash.alpha = 0
        }, completion: { _ in
            self.splash.removeFromSuperview()
        })
    }

    private func showLoadFailure(message: String) {
        #if DEBUG
        print(message)
        #endif
        dismissSplash()
        let label = UILabel()
        label.text = "Couldn't load Noteblock Pianola.\n\(message)"
        label.textColor = .white
        label.numberOfLines = 0
        label.textAlignment = .center
        label.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(label)
        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            label.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 24),
            label.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor, constant: -24),
        ])
    }
}

extension MusicBoxViewController: WKNavigationDelegate {
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        webViewHasFinishedFirstLoad = true
        dismissSplash()
        if let slug = pendingSongSlug {
            pendingSongSlug = nil
            applySongSlug(slug)
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        showLoadFailure(message: error.localizedDescription)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        showLoadFailure(message: error.localizedDescription)
    }
}

#if DEBUG
extension MusicBoxViewController: WKScriptMessageHandler {
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "consoleBridge",
              let body = message.body as? [String: Any],
              let level = body["level"] as? String,
              let text = body["message"] as? String else { return }
        print("[web:\(level)] \(text)")
    }
}
#endif
