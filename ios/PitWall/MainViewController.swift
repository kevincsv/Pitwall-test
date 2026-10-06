import UIKit
import WebKit
import UserNotifications

/// Shows the Pit Wall app served by PitWall.exe on the PC, or the bundled
/// connect screen that finds the PC on the Wi-Fi network.
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
        if let saved = defaults.string(forKey: pcKey), let url = URL(string: saved) {
            openRemote(url)
        } else {
            showCompanion()
        }
    }

    private func openRemote(_ url: URL) {
        loadingRemote = true
        webView.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 6))
    }

    private func showCompanion(error: String? = nil) {
        loadingRemote = false
        guard let url = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "web") else {
            showConnect(error: error ?? "Pitlane HQ app bundle is missing.")
            return
        }
        webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        if let error = error {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { [weak self] in
                self?.callJS("onError", error)
            }
        }
    }

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
            if let text = body["url"] as? String, let url = URL(string: text) {
                defaults.set(text, forKey: pcKey)
                openRemote(url)
            }
        case "reset":
            defaults.removeObject(forKey: pcKey)
            showConnect(error: nil)
        case "notify":
            scheduleReminders(body["items"] as? [[String: Any]] ?? [])
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
        if loadingRemote { showCompanion(error: error.localizedDescription) }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if loadingRemote { showConnect(error: error.localizedDescription) }
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

    /// Reminders 15 minutes before each race in the plan.
    private func scheduleReminders(_ items: [[String: Any]]) {
        let center = UNUserNotificationCenter.current()
        center.requestAuthorization(options: [.alert, .sound]) { granted, _ in
            guard granted else { return }
            center.removeAllPendingNotificationRequests()
            for item in items.prefix(60) {
                guard let ms = item["t"] as? Double, let title = item["title"] as? String else { continue }
                let fire = Date(timeIntervalSince1970: ms / 1000).addingTimeInterval(-15 * 60)
                if fire <= Date() { continue }
                let content = UNMutableNotificationContent()
                content.title = title
                content.body = (item["body"] as? String) ?? ""
                content.sound = .default
                let parts = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute, .second], from: fire)
                let trigger = UNCalendarNotificationTrigger(dateMatching: parts, repeats: false)
                center.add(UNNotificationRequest(identifier: "race-\(Int64(ms))", content: content, trigger: trigger))
            }
        }
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
