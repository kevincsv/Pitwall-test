import Foundation

/// Races shared between the app and its home-screen widget.
enum SharedRaces {
    static let group = "group.com.pitwall.app"
    static let key = "races"

    struct Race: Codable, Hashable {
        var start: Date
        var minutes: Int
        var title: String
        var detail: String
        var end: Date { start.addingTimeInterval(Double(minutes) * 60) }
    }

    static func load() -> [Race] {
        guard let data = UserDefaults(suiteName: group)?.data(forKey: key),
              let list = try? JSONDecoder().decode([Race].self, from: data) else { return [] }
        return list.sorted { $0.start < $1.start }
    }
}
