import WidgetKit
import SwiftUI

/// "Next races" widget: home screen (small, medium) and lock screen.
struct RacesEntry: TimelineEntry {
    let date: Date
    let races: [SharedRaces.Race]
}

struct RacesProvider: TimelineProvider {
    func placeholder(in context: Context) -> RacesEntry {
        RacesEntry(date: Date(), races: [SharedRaces.Race(start: Date().addingTimeInterval(5400), minutes: 45,
                                                          title: "GT3 Fixed", detail: "Spa · 20:00")])
    }

    func getSnapshot(in context: Context, completion: @escaping (RacesEntry) -> Void) {
        completion(context.isPreview ? placeholder(in: context) : entry(at: Date()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<RacesEntry>) -> Void) {
        let now = Date()
        var dates = [now]
        // a new entry when each race starts and ends, so finished races drop off
        for race in SharedRaces.load() where race.end > now {
            if race.start > now { dates.append(race.start) }
            dates.append(race.end)
            if dates.count > 20 { break }
        }
        let entries = dates.map { entry(at: $0) }
        completion(Timeline(entries: entries, policy: .after(now.addingTimeInterval(6 * 3600))))
    }

    private func entry(at date: Date) -> RacesEntry {
        RacesEntry(date: date, races: SharedRaces.load().filter { $0.end > date })
    }
}

private let amber = Color(red: 1.0, green: 0.69, blue: 0.18)
private let ink = Color(red: 0.067, green: 0.082, blue: 0.106)

struct RacesWidgetView: View {
    @Environment(\.widgetFamily) var family
    let entry: RacesEntry

    var body: some View {
        content
            .widgetBackground(ink)
    }

    @ViewBuilder var content: some View {
        if entry.races.isEmpty {
            VStack(alignment: .leading, spacing: 4) {
                Text("PITLANE HQ").font(.caption2.weight(.bold)).foregroundColor(amber)
                Spacer()
                Text("No races planned").font(.headline).foregroundColor(.white)
                Text("Add them in the Calendar").font(.caption).foregroundColor(.gray)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            switch family {
            case .systemMedium: medium
            case .accessoryRectangular: lockScreen
            default: small
            }
        }
    }

    var small: some View {
        let r = entry.races[0]
        return VStack(alignment: .leading, spacing: 3) {
            Text("NEXT RACE").font(.caption2.weight(.bold)).foregroundColor(amber)
            Spacer(minLength: 0)
            Text(r.start, style: .relative).font(.title3.weight(.bold).monospacedDigit()).foregroundColor(.white)
                .minimumScaleFactor(0.7)
            Text(r.title).font(.subheadline.weight(.semibold)).foregroundColor(.white).lineLimit(2)
            Text(r.start, style: .time).font(.caption).foregroundColor(.gray)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    var medium: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("NEXT RACES").font(.caption2.weight(.bold)).foregroundColor(amber)
            ForEach(entry.races.prefix(3), id: \.self) { r in
                HStack(alignment: .firstTextBaseline) {
                    Text(r.start, style: .time).font(.subheadline.weight(.bold).monospacedDigit()).foregroundColor(amber)
                        .frame(width: 56, alignment: .leading)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(r.title).font(.subheadline.weight(.semibold)).foregroundColor(.white).lineLimit(1)
                        Text(r.detail).font(.caption2).foregroundColor(.gray).lineLimit(1)
                    }
                    Spacer()
                    Text(r.start, style: .relative).font(.caption2.monospacedDigit()).foregroundColor(.gray).lineLimit(1)
                        .frame(maxWidth: 70, alignment: .trailing)
                }
            }
            Spacer(minLength: 0)
        }
    }

    var lockScreen: some View {
        let r = entry.races[0]
        return VStack(alignment: .leading, spacing: 1) {
            Text(r.title).font(.headline).lineLimit(1)
            Text(r.start, style: .relative).font(.caption.monospacedDigit())
            Text(r.start, style: .time).font(.caption2)
        }
    }
}

extension View {
    @ViewBuilder func widgetBackground(_ color: Color) -> some View {
        if #available(iOS 17.0, *) {
            containerBackground(color, for: .widget)
        } else {
            padding().background(color)
        }
    }
}

@main
struct PitlaneWidget: Widget {
    var body: some WidgetConfiguration {
        let families: [WidgetFamily]
        if #available(iOS 16.0, *) {
            families = [.systemSmall, .systemMedium, .accessoryRectangular]
        } else {
            families = [.systemSmall, .systemMedium]
        }
        return StaticConfiguration(kind: "PitlaneRaces", provider: RacesProvider()) { entry in
            RacesWidgetView(entry: entry)
        }
        .configurationDisplayName("Next races")
        .description("Your next planned iRacing races.")
        .supportedFamilies(families)
    }
}
