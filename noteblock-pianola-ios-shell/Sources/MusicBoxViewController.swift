import UIKit
import WebKit

final class MusicBoxViewController: UIViewController {

    // MARK: - Content mode (Phase 2 decision)
    //
    // Flip these two constants to switch from "fully bundled" to
    // "hybrid" without touching anything else in this file. See
    // ios-app-plan.md Phase 2 for the tradeoffs. Nothing else in the
    // app needs to change either way — script.js fetches midilist.json,
    // minecraft3.sf2, and midi/*.mid with plain relative paths, and
    // those resolve the same way whether the base document came from
    // file:// (via allowingReadAccessTo) or https:// (ordinary same-
    // origin fetch). No NSAppTransportSecurity exception is needed for
    // the remote case either — GitHub Pages is HTTPS-only and ATS
    // allows HTTPS by default.
    private static let useRemoteContent = false
    private static let remoteURL = URL(string: "https://witch-craftmagazine.github.io/noteblock-pianola/")!

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

        webView = WKWebView(frame: view.bounds, configuration: configuration)
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.navigationDelegate = self
        webView.scrollView.bounces = false
        webView.scrollView.isScrollEnabled = false
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
        // staged by CI (see .github/workflows/build.yml). Granting
        // read access to that whole directory — not just index.html —
        // is what lets script.js's plain `fetch('./minecraft3.sf2')`
        // etc. succeed. This is Phase 0's second risk; confirm on a
        // physical device before relying on it.
        guard
            let webDir = Bundle.main.url(forResource: "web", withExtension: nil),
            FileManager.default.fileExists(atPath: webDir.appendingPathComponent("index.html").path)
        else {
            showLoadFailure(message: "Bundled web/index.html not found. Did CI's staging step run before xcodegen generate?")
            return
        }
        let indexURL = webDir.appendingPathComponent("index.html")
        webView.loadFileURL(indexURL, allowingReadAccessTo: webDir)
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
          window.addEventListener('error', function (e) {
            send('error', [(e.error && (e.error.stack || e.error.message)) || e.message]);
          });
          window.addEventListener('unhandledrejection', function (e) {
            send('error', ['Unhandled promise rejection: ' + ((e.reason && (e.reason.stack || e.reason.message)) || e.reason)]);
          });
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
