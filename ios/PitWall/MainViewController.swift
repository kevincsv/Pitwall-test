import UIKit
import WebKit
import UserNotifications
import WidgetKit
import Security

/// Opens the Pitlane HQ app bundled with the phone (account, planner, races,
/// community: no PC needed). Live telemetry and the rig open the page served by
/// PitlaneHQ.exe on the PC once it is paired with the code it shows; without the
/// PC it falls back to the bundled app.
final class MainViewController: UIViewController, WKScriptMessageHandler, WKNavigationDelegate {
    private var webView: WKWebView!
    private let defaults = UserDefaults.standard
    private let pcKey = "pitwall.pc"
    private var loadingRemote = false

    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }

    override func loadView() {
        let config = WKWebViewConfiguration()
        let controller = WKUserContentController()
        controller.add(WeakMessageHandler(self), name: "pitwall")
        controller.addUserScript(WKUserScript(source: "window.PitWallNative = { ios: true };",
                                              injectionTime: .atDocumentStart,
                                              forMainFrameOnly: true))
        config.userContentController = controller
        config.allowsInlineMediaPlayback = true
        // the bundled app reads its own files (server.json, sample data)
        config.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 0.067, green: 0.082, blue: 0.106, alpha: 1)
        webView.scrollView.backgroundColor = webView.backgroundColor
        view = webView
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        UIApplication.shared.isIdleTimerDisabled = true // keep the screen on while racing
        // always start in the phone app; the paired PC opens from Telemetry
        showCompanion()
    }

    private func openRemote(_ url: URL) {
        loadingRemote = true
        webView.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 6))
    }

    /// The app pages bundled with the phone (the same ones PitlaneHQ.exe serves).
    private func showCompanion() {
        loadingRemote = false
        guard let url = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "dist") else {
            showConnect(error: nil)
            return
        }
        webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
    }

    /// The QR code on the PC: pitlanehq://open?url=http://192.168.x.y:8484/pair?pin=…
    func openLink(_ link: URL) {
        guard link.scheme == "pitlanehq",
              let target = URLComponents(url: link, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "url" })?.value,
              Self.isLanURL(target), let url = URL(string: target) else { return }
        let base = target.components(separatedBy: "/pair?").first ?? target
        defaults.set(base.hasSuffix("/") ? base : base + "/", forKey: pcKey)
        openRemote(url)
    }

    /// Only PitlaneHQ.exe on the home network: http to a private IPv4 address.
    static func isLanURL(_ text: String) -> Bool {
        guard let u = URL(string: text), u.scheme == "http", let host = u.host else { return false }
        let p = host.split(separator: ".").compactMap { Int($0) }
        guard p.count == 4 else { return false }
        return p[0] == 10 || (p[0] == 192 && p[1] == 168) || (p[0] == 172 && (16...31).contains(p[1]))
    }

    /// The phone's own (bundled) pages, not the PC's or any other site.
    private func onOwnPage() -> Bool { webView.url?.isFileURL ?? false }

    private func showConnect(error: String?) {
        loadingRemote = false
        guard let url = Bundle.main.url(forResource: "connect", withExtension: "html") else { return }
        webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        if let error = error {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { [weak self] in
                self?.callJS("onError", error)
            }
        }
    }

    // Messages from the pages: window.webkit.messageHandlers.pitwall.postMessage({...})
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        switch type {
        case "ip":
            callJS("onIP", localIPv4() ?? "")
        case "open":
            if let text = body["url"] as? String, Self.isLanURL(text), let url = URL(string: text) {
                defaults.set(text, forKey: pcKey)
                openRemote(url)
            }
        case "reset":
            defaults.removeObject(forKey: pcKey)
            showCompanion()
        case "companion":
            showCompanion()
        case "lastpc":
            callJS("onLastPC", defaults.string(forKey: pcKey) ?? "")
        case "secret-set", "secret-del", "secret-get" where !onOwnPage():
            return // the account keys only go to the phone's own pages
        case "secret-set":
            if let key = body["key"] as? String, let value = body["value"] as? String { Keychain.set(key, value) }
        case "secret-del":
            if let key = body["key"] as? String { Keychain.remove(key) }
        case "secret-get":
            if let key = body["key"] as? String {
                let out: [String: Any] = ["key": key, "value": Keychain.get(key) ?? NSNull()]
                let data = (try? JSONSerialization.data(withJSONObject: out)) ?? Data()
                callJS("onSecret", String(data: data, encoding: .utf8) ?? "{}")
            }
        case "notify":
            let items = body["items"] as? [[String: Any]] ?? []
            let leads = (body["leads"] as? [Any])?.compactMap { ($0 as? NSNumber)?.intValue } ?? [15]
            scheduleReminders(items, leads: leads, spanish: (body["lang"] as? String) == "es")
            shareWithWidget(items)
        default:
            break
        }
    }

    private func callJS(_ function: String, _ value: String) {
        let data = (try? JSONSerialization.data(withJSONObject: [value])) ?? Data("[\"\"]".utf8)
        let args = String(data: data, encoding: .utf8) ?? "[\"\"]"
        webView.evaluateJavaScript("window.\(function) && window.\(function).apply(null, \(args))", completionHandler: nil)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        loadingRemote = false
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        if loadingRemote { showCompanion() }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if loadingRemote { showCompanion() }
    }

    /// The phone's Wi-Fi address, used by the connect screen to search the network.
    private func localIPv4() -> String? {
        var result: String?
        var list: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&list) == 0, let first = list else { return nil }
        defer { freeifaddrs(list) }
        var cursor: UnsafeMutablePointer<ifaddrs>? = first
        while let item = cursor {
            defer { cursor = item.pointee.ifa_next }
            let flags = Int32(item.pointee.ifa_flags)
            guard let addr = item.pointee.ifa_addr,
                  addr.pointee.sa_family == UInt8(AF_INET),
                  (flags & IFF_UP) != 0, (flags & IFF_LOOPBACK) == 0 else { continue }
            let name = String(cString: item.pointee.ifa_name)
            guard name.hasPrefix("en") || name.hasPrefix("bridge") else { continue }
            var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
            if getnameinfo(addr, socklen_t(addr.pointee.sa_len), &host, socklen_t(host.count), nil, 0, NI_NUMERICHOST) == 0 {
                result = String(cString: host)
                if name == "en0" { break }
            }
        }
        return result
    }

    /// Reminders before each race in the calendar (the minutes chosen in the app).
    private func scheduleReminders(_ items: [[String: Any]], leads: [Int], spanish: Bool) {
        let center = UNUserNotificationCenter.current()
        center.requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            guard granted else { return }
            center.removeAllPendingNotificationRequests()
            var count = 0
            for item in items {
                guard let ms = item["t"] as? Double, let title = item["title"] as? String else { continue }
                for lead in (leads.isEmpty ? [15] : leads) {
                    let fire = Date(timeIntervalSince1970: ms / 1000).addingTimeInterval(-Double(lead) * 60)
                    if fire <= Date() || count >= 60 { continue } // iOS keeps at most 64
                    let content = UNMutableNotificationContent()
                    content.title = title
                    let when = spanish ? "Empieza en \(lead) min" : "Starts in \(lead) min"
                    let extra = (item["body"] as? String) ?? ""
                    content.body = extra.isEmpty ? when : "\(when) · \(extra)"
                    content.sound = .default
                    content.threadIdentifier = "races"
                    let parts = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute, .second], from: fire)
                    let trigger = UNCalendarNotificationTrigger(dateMatching: parts, repeats: false)
                    center.add(UNNotificationRequest(identifier: "race-\(Int64(ms))-\(lead)", content: content, trigger: trigger))
                    count += 1
                }
            }
        }
    }

    /// The home-screen widget reads the next races from the shared app group.
    private func shareWithWidget(_ items: [[String: Any]]) {
        guard let shared = UserDefaults(suiteName: SharedRaces.group) else { return }
        let races = items.compactMap { item -> SharedRaces.Race? in
            guard let ms = item["t"] as? Double, let title = item["title"] as? String else { return nil }
            return SharedRaces.Race(start: Date(timeIntervalSince1970: ms / 1000),
                                    minutes: (item["mins"] as? NSNumber)?.intValue ?? 60,
                                    title: title, detail: (item["body"] as? String) ?? "")
        }
        if let data = try? JSONEncoder().encode(races) {
            shared.set(data, forKey: SharedRaces.key)
        }
        if #available(iOS 14.0, *) { WidgetCenter.shared.reloadAllTimelines() }
    }
}

/// Avoids a retain cycle between the web view and its message handler.
final class WeakMessageHandler: NSObject, WKScriptMessageHandler {
    private weak var target: WKScriptMessageHandler?
    init(_ target: WKScriptMessageHandler) { self.target = target }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(userContentController, didReceive: message)
    }
}

/// Small secrets (the Pitlane HQ session and data key) in the iOS Keychain,
/// readable only by this app on this device after the first unlock.
enum Keychain {
    private static let service = "com.pitwall.app.secrets"

    private static func query(_ key: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: key]
    }

    static func set(_ key: String, _ value: String) {
        let data = Data(value.utf8)
        var q = query(key)
        SecItemDelete(q as CFDictionary)
        q[kSecValueData as String] = data
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(q as CFDictionary, nil)
    }

    static func get(_ key: String) -> String? {
        var q = query(key)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func remove(_ key: String) {
        SecItemDelete(query(key) as CFDictionary)
    }
}
