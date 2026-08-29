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
        observeAudioSessionNotifications()

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

    // MARK: - Interruptions & route changes
    //
    // Without these, background/lock-screen playback "works" in the
    // trivial sense (audio keeps going until something interrupts it),
    // but a phone call, Siri, or another app grabbing the audio session
    // leaves the web app's own `playing` state and UI (script.js's
    // `ui.play` button, seek loop) out of sync with what's actually
    // audible afterward, and unplugging headphones would otherwise keep
    // blasting audio out the speaker instead of pausing like every other
    // media app does.
    private func observeAudioSessionNotifications() {
        let center = NotificationCenter.default
        center.addObserver(
            self,
            selector: #selector(handleInterruption(_:)),
            name: AVAudioSession.interruptionNotification,
            object: AVAudioSession.sharedInstance()
        )
        center.addObserver(
            self,
            selector: #selector(handleRouteChange(_:)),
            name: AVAudioSession.routeChangeNotification,
            object: AVAudioSession.sharedInstance()
        )
    }

    @objc private func handleInterruption(_ notification: Notification) {
        guard let info = notification.userInfo,
              let typeValue = info[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: typeValue) else { return }

        switch type {
        case .began:
            // iOS has already stopped audio output at this point (call
            // ringing, Siri activated, another app took the session).
            // Tell script.js to pause so `window.musicPlayer.isPlaying()`,
            // the play/pause button, and the lock-screen state (via
            // NowPlayingBridge's onMusicPause hook, fired as a
            // consequence of this) all agree with reality.
            pauseWebPlayback()
        case .ended:
            // Resuming automatically on `.shouldResume` would restart
            // audio without the person asking for it again after e.g. a
            // phone call — leave it paused and let them tap play, same
            // as Music.app's behavior for most interruption types.
            break
        @unknown default:
            break
        }
    }

    @objc private func handleRouteChange(_ notification: Notification) {
        guard let info = notification.userInfo,
              let reasonValue = info[AVAudioSessionRouteChangeReasonKey] as? UInt,
              let reason = AVAudioSession.RouteChangeReason(rawValue: reasonValue) else { return }

        // .oldDeviceUnavailable fires when headphones/Bluetooth audio is
        // unplugged/disconnected mid-playback — pause rather than switch
        // to blasting out the speaker unannounced.
        if reason == .oldDeviceUnavailable {
            pauseWebPlayback()
        }
    }

    private func pauseWebPlayback() {
        (window?.rootViewController as? MusicBoxViewController)?.pausePlayback()
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

    // MARK: - Home Screen Quick Actions
    //
    // Static items (UIApplicationShortcutItems, Info.plist) rather than
    // dynamic ones registered at runtime — there's nothing user/session-
    // specific about "Shuffle" or "Resume last song" that would need
    // updating between launches, so static is simpler and sufficient.
    //
    // A shortcut can also *launch* the app (cold start), in which case
    // this callback fires after `didFinishLaunchingWithOptions` but the
    // web view's first page load is very unlikely to have finished yet.
    // `MusicBoxViewController.handleShortcut(_:)` below queues the action
    // the same way `loadSong`/deep links already queue against
    // `webViewHasFinishedFirstLoad`, rather than assuming the page (and
    // `window.musicPlayer`) is ready to call into.
    func application(
        _ application: UIApplication,
        performActionFor shortcutItem: UIApplicationShortcutItem,
        completionHandler: @escaping (Bool) -> Void
    ) {
        guard let root = window?.rootViewController as? MusicBoxViewController,
              let action = MusicBoxViewController.ShortcutAction(shortcutItemType: shortcutItem.type) else {
            completionHandler(false)
            return
        }
        root.handleShortcut(action)
        completionHandler(true)
    }
}
