import UIKit
import AVFoundation

// No SceneDelegate / UIApplicationSceneManifest on purpose — this is a
// single-window app and the classic AppDelegate-owns-the-window model
// is simpler for a thin wrapper like this. (If a future version wants
// multi-window iPad support, that's the point to add scenes.)

@main
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        configureAudioSession()

        let window = UIWindow(frame: UIScreen.main.bounds)
        let root = MusicBoxViewController()
        window.rootViewController = root
        window.makeKeyAndVisible()
        self.window = window

        // Cold-launch via Universal Link or custom scheme is delivered
        // through `continue userActivity:` / `open url:` below, not
        // through launchOptions, so nothing else to do here.

        return true
    }

    // MARK: - Audio session

    /// `.playback` + `UIBackgroundModes: [audio]` (see project.yml) is
    /// what lets winding/playback continue past screen lock and the
    /// silent switch. Confirm this on a physical device (Phase 0/3) —
    /// simulator audio behaves differently and isn't a reliable test
    /// of background survival.
    private func configureAudioSession() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playback, mode: .default, options: [])
            try session.setActive(true)
        } catch {
            // Not fatal — the web app still runs, it just won't survive
            // backgrounding/lock reliably. Surface it during Phase 0
            // testing rather than silently swallowing it in production.
            #if DEBUG
            print("AVAudioSession configuration failed: \(error)")
            #endif
        }
    }

    // MARK: - Deep linking (Phase 3, optional)
    //
    // Two entry points feed the same place: a `?song=<slug>` query
    // param the web app already understands (see noteblock-docs.md,
    // "?song= deep link"). Neither is wired to a real slug source yet —
    // add Associated Domains + apple-app-site-association hosting on
    // witch-craftmagazine.github.io for Universal Links, or just rely
    // on the custom scheme below, which needs no server-side file.

    /// Custom scheme: noteblockpianola://song/<slug>
    func application(
        _ app: UIApplication,
        open url: URL,
        options: [UIApplication.OpenURLOptionsKey: Any] = [:]
    ) -> Bool {
        guard url.scheme == "noteblockpianola",
              url.host == "song",
              let root = window?.rootViewController as? MusicBoxViewController else {
            return false
        }
        let slug = url.pathComponents.dropFirst().joined(separator: "/")
        guard !slug.isEmpty else { return false }
        root.loadSong(slug: slug)
        return true
    }

    /// Universal Link: https://witch-craftmagazine.github.io/noteblock-pianola/?song=<slug>
    func application(
        _ application: UIApplication,
        continue userActivity: NSUserActivity,
        restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
    ) -> Bool {
        guard userActivity.activityType == NSUserActivityTypeBrowsingWeb,
              let url = userActivity.webpageURL,
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let slug = components.queryItems?.first(where: { $0.name == "song" })?.value,
              let root = window?.rootViewController as? MusicBoxViewController else {
            return false
        }
        root.loadSong(slug: slug)
        return true
    }
}
