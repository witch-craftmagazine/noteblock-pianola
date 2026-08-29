import Foundation
import MediaPlayer
import WebKit

/// Bridges the web app's playback state to the lock screen / Control
/// Center, and routes lock-screen remote commands back into the page.
///
/// The web app (script.js) already calls `window.onMusicPlay()`,
/// `window.onMusicPause()`, and `window.onMusicEnd()` as optional
/// extension points if they're defined — nothing there needed to
/// change to add a listener. This class injects a WKUserScript that
/// defines those three functions, posting a `{event, title, playing,
/// currentTime, duration}` payload to a `nowPlayingBridge` message
/// handler each time script.js calls one.
///
/// Elapsed time is read once per event (via the `getCurrentTime`/
/// `getDuration` getters added to `window.musicPlayer` in script.js)
/// rather than polled on an interval: once `MPNowPlayingInfoPropertyElapsedPlaybackTime`
/// and `MPNowPlayingInfoPropertyPlaybackRate` are set, iOS interpolates
/// the lock-screen scrubber itself between updates. That matters
/// because a JS-side polling loop driven by `requestAnimationFrame`
/// (like script.js's own `startSeekLoop`) stops firing once the app is
/// backgrounded/screen-locked — exactly when this needs to keep working.
final class NowPlayingBridge: NSObject {
    static let messageHandlerName = "nowPlayingBridge"

    /// Set by MusicBoxViewController right after the WKWebView is
    /// created. Can't be an init parameter: `install(into:)` has to run
    /// on the WKWebViewConfiguration *before* the WKWebView exists (user
    /// scripts/message handlers are captured at WKWebView init), so the
    /// webView itself necessarily comes later.
    weak var webView: WKWebView?

    private let mediaTitle = "Noteblock Pianola"
    private var artworkImage: MPMediaItemArtwork?

    // MARK: - Haptics
    //
    // Kept deliberately subtle (.light/.soft, not .heavy) and fired only
    // on discrete user-meaningful transitions — play/pause toggle, track
    // change, and a completed crank wind-up — never on a timer or during
    // steady playback. Generators are prepared lazily right before use
    // rather than kept "always armed", since this app can sit backgrounded
    // for a long time between transitions and there's no benefit to
    // keeping the Taptic Engine warm the whole time.
    private let playPauseFeedback = UIImpactFeedbackGenerator(style: .light)
    private let trackChangeFeedback = UIImpactFeedbackGenerator(style: .soft)
    private let crankFeedback = UISelectionFeedbackGenerator()
    // `.rigid`, not `.light`/`.soft` — these fire rapidly while the user
    // is actively dragging the crank (one per notch, see onCrankNotch),
    // so they need the crispest, most immediate-feeling impact style to
    // read as a mechanical ratchet click rather than a mushy buzz.
    private let crankNotchFeedback = UIImpactFeedbackGenerator(style: .rigid)
    private let uiTapFeedback = UIImpactFeedbackGenerator(style: .light)

    /// Last title we saw in a `play` event, used to tell "resumed the same
    /// track" (play/pause-toggle haptic) apart from "a different track
    /// started" (track-change haptic) — script.js's payload already
    /// includes `title` on every event, so no new JS-side signal is
    /// needed to make this distinction.
    private var lastPlayingTitle: String?

    override init() {
        super.init()
        if let icon = UIImage(named: "AppIcon") ?? UIImage(systemName: "pianoforte") {
            artworkImage = MPMediaItemArtwork(boundsSize: icon.size) { _ in icon }
        }
        configureRemoteCommands()
    }

    /// Injects the JS-side hooks. Call once, before the first page load,
    /// same as `installConsoleBridge`.
    func install(into configuration: WKWebViewConfiguration) {
        let js = """
        (function () {
          function post(event) {
            try {
              var mp = window.musicPlayer;
              window.webkit.messageHandlers.\(Self.messageHandlerName).postMessage({
                event: event,
                title: window._currentSong || '',
                playing: mp ? mp.isPlaying() : false,
                currentTime: mp && mp.getCurrentTime ? mp.getCurrentTime() : 0,
                duration: mp && mp.getDuration ? mp.getDuration() : 0
              });
            } catch (e) {}
          }
          window.onMusicPlay = function () { post('play'); };
          window.onMusicPause = function () { post('pause'); };
          window.onMusicEnd = function () { post('end'); };
          // src/musicbox/scene.js calls this once per completed crank
          // wind-up (not per drag tick) — reuses the same message
          // handler/payload shape rather than a second bridge class.
          window.onCrankTurn = function () { post('crank'); };
          // Fires repeatedly while dragging the crank, once per ratchet
          // "notch" (see CONFIG.CRANK_NOTCHES_PER_REV in scene.js) —
          // distinct from onCrankTurn above, which fires once when
          // enough winding has accumulated to actually start playback.
          window.onCrankNotch = function () { post('cranknotch'); };
          // Generic "a UI button was tapped" signal, called explicitly
          // by script.js at button handlers that don't already imply a
          // playback/track-state change (browse, share, sort, upload,
          // and the 3D lid) — see notifyUiTap() in script.js for why
          // play/prev/next/shuffle deliberately don't also call this.
          window.onUiButtonTap = function () { post('uitap'); };
        })();
        """
        let script = WKUserScript(source: js, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        configuration.userContentController.addUserScript(script)
        configuration.userContentController.add(self, name: Self.messageHandlerName)
    }

    func teardown(from configuration: WKWebViewConfiguration) {
        configuration.userContentController.removeScriptMessageHandler(forName: Self.messageHandlerName)
        MPRemoteCommandCenter.shared().playCommand.removeTarget(nil)
        MPRemoteCommandCenter.shared().pauseCommand.removeTarget(nil)
        MPRemoteCommandCenter.shared().nextTrackCommand.removeTarget(nil)
        MPRemoteCommandCenter.shared().previousTrackCommand.removeTarget(nil)
        MPRemoteCommandCenter.shared().changePlaybackPositionCommand.removeTarget(nil)
    }

    // MARK: - Remote Command Center (lock screen / Control Center buttons)

    private func configureRemoteCommands() {
        let center = MPRemoteCommandCenter.shared()

        center.playCommand.addTarget { [weak self] _ in
            self?.evaluate("window.musicPlayer.play()")
            return .success
        }
        center.pauseCommand.addTarget { [weak self] _ in
            self?.evaluate("window.musicPlayer.pause()")
            return .success
        }
        center.nextTrackCommand.addTarget { [weak self] _ in
            self?.evaluate("window.musicPlayer.next()")
            return .success
        }
        center.previousTrackCommand.addTarget { [weak self] _ in
            self?.evaluate("window.musicPlayer.prev()")
            return .success
        }
        // `window.musicPlayer.seek(seconds)` now exists (script.js), so
        // wire the lock-screen scrubber to it. changePlaybackPositionCommand
        // hands back an MPChangePlaybackPositionCommandEvent whose
        // `positionTime` is already absolute seconds — same unit `seek`
        // expects, no scaling needed.
        center.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let event = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
            self?.evaluate("window.musicPlayer.seek(\(event.positionTime))")
            return .success
        }
        // Skip changeShuffleModeCommand/skip-interval — no matching
        // behavior on the JS side to call into.
    }

    private func evaluate(_ js: String) {
        // Evaluating JS on a backgrounded WKWebView still works as long
        // as the process stays alive, which the .playback audio session
        // + UIBackgroundModes: [audio] combination guarantees here.
        webView?.evaluateJavaScript(js)
    }

    // MARK: - Now Playing info

    private func updateNowPlayingInfo(title: String, playing: Bool, currentTime: Double, duration: Double) {
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: title.isEmpty ? mediaTitle : Self.humanize(title),
            MPMediaItemPropertyArtist: mediaTitle,
            MPNowPlayingInfoPropertyPlaybackRate: playing ? 1.0 : 0.0,
        ]
        if duration > 0 {
            info[MPMediaItemPropertyPlaybackDuration] = duration
            info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = currentTime
        }
        if let artworkImage {
            info[MPMediaItemPropertyArtwork] = artworkImage
        }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
        MPNowPlayingInfoCenter.default().playbackState = playing ? .playing : .paused
    }

    /// `_currentSong` is a bare filename (e.g. `moonlight_sonata_3rd_mvmt_1801_-_beethoven`,
    /// see midi/ in the parent repo's filename convention) — a trailing
    /// `_-_composer`/year suffix isn't reliably parseable generically, so
    /// this just swaps underscores for spaces and title-cases it rather
    /// than guessing at a title/composer split.
    private static func humanize(_ filename: String) -> String {
        filename
            .replacingOccurrences(of: "_", with: " ")
            .split(separator: " ")
            .map { $0.prefix(1).uppercased() + $0.dropFirst() }
            .joined(separator: " ")
    }
}

extension NowPlayingBridge: WKScriptMessageHandler {
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == Self.messageHandlerName,
              let body = message.body as? [String: Any] else { return }

        let title = body["title"] as? String ?? ""
        let playing = body["playing"] as? Bool ?? false
        let currentTime = (body["currentTime"] as? NSNumber)?.doubleValue ?? 0
        let duration = (body["duration"] as? NSNumber)?.doubleValue ?? 0
        let event = body["event"] as? String

        switch event {
        case "crank":
            // Fired once per completed wind-up (see scene.js's
            // onCrankTurn call) — doesn't carry/affect Now Playing state,
            // just a haptic.
            crankFeedback.selectionChanged()
            return

        case "cranknotch":
            // Fired repeatedly during a crank drag — no .prepare() call
            // here (unlike the other generators): preparing on every
            // single notch during a fast drag would fight the Taptic
            // Engine's own re-arm timing more than it helps, and the
            // generator re-primes itself automatically after each
            // impactOccurred() anyway.
            crankNotchFeedback.impactOccurred()
            return

        case "uitap":
            uiTapFeedback.prepare()
            uiTapFeedback.impactOccurred()
            return

        case "end":
            // Track ended; script.js auto-advances and fires its own
            // onMusicPlay for the next track a moment later, so just
            // clear playback state here rather than guessing at the next
            // track's title before script.js reports it. No haptic here —
            // the auto-advance's own "play" event (below) supplies the
            // track-change haptic once the next title is known.
            MPNowPlayingInfoCenter.default().playbackState = .stopped
            return

        case "play":
            if let lastPlayingTitle, lastPlayingTitle != title {
                trackChangeFeedback.prepare()
                trackChangeFeedback.impactOccurred()
            } else {
                playPauseFeedback.prepare()
                playPauseFeedback.impactOccurred()
            }
            lastPlayingTitle = title

        case "pause":
            playPauseFeedback.prepare()
            playPauseFeedback.impactOccurred()

        default:
            break
        }

        updateNowPlayingInfo(title: title, playing: playing, currentTime: currentTime, duration: duration)
    }
}
