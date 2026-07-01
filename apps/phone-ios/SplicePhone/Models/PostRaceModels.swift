import Foundation

struct RecentRaceResult: Identifiable, Equatable, Sendable {
    var id: String { raceEntryId }
    let raceId: String
    let raceName: String
    let seriesId: String
    let seriesName: String
    let groupId: String
    let clubName: String?
    let scheduledAt: String
    let raceType: String
    let raceEntryId: String
    let boatId: String
    let sailNumber: String
    let boatLabel: String?
    let outcome: String?
    let finishDisplay: String
    let trackSubmissionId: String?
    let trackStatus: String?
}

struct SeriesRaceResult: Identifiable, Equatable, Sendable {
    var id: String { raceEntryId }
    let raceId: String
    let raceName: String
    let scheduledAt: String
    let raceEntryId: String
    let boatId: String
    let sailNumber: String
    let boatLabel: String?
    let finishDisplay: String
    let trackSubmissionId: String?
    let trackStatus: String?
}

struct SeriesResultsGroup: Identifiable, Equatable, Sendable {
    var id: String { seriesId }
    let seriesId: String
    let seriesName: String
    let groupId: String
    let clubName: String?
    let overallRank: Int?
    let overallOf: Int?
    let races: [SeriesRaceResult]

    var overallPositionLabel: String? {
        guard let overallRank, let overallOf else { return nil }
        return "\(overallRank) / \(overallOf)"
    }
}

struct TrackSubmissionSummary: Identifiable, Equatable, Sendable {
    let id: String
    let activityName: String?
    let activityStartedAt: String
    let activityEndedAt: String?
    let status: String
    let trackSource: String?
    let analysisMode: String?
    let raceId: String?
    let raceEntryId: String?
    let raceName: String?
    let seriesName: String?
    let durationSeconds: Double?
    let windDirection: Double?
    let legCount: Int?
    let tackCount: Int?
    let gybeCount: Int?

    var statusLabel: String {
        status.replacingOccurrences(of: "_", with: " ").capitalized
    }

    var sourceLabel: String {
        switch trackSource?.lowercased() {
        case "strava": return "Strava"
        case "upload": return "Upload"
        default: return trackSource?.capitalized ?? "Track"
        }
    }

    var isReady: Bool { status == "ready" }

    /// Best available instant for sorting and display (start, then end).
    var sortTimestamp: String {
        if !activityStartedAt.isEmpty { return activityStartedAt }
        return activityEndedAt ?? ""
    }
}

struct AnalysisLegRow: Identifiable, Equatable, Sendable {
    var id: String { "\(legNo)-\(from)-\(to)" }
    let legNo: String
    let from: String
    let to: String
    let legType: String
    let durationSeconds: Double?
}

struct TrackSubmissionDetail: Equatable, Sendable {
    let summary: TrackSubmissionSummary
    let legs: [AnalysisLegRow]
    let durationSeconds: Double?
    let tackCount: Int?
    let gybeCount: Int?
    let windDirection: Double?
    let analysisUrl: String
}

struct FleetAnalysisPeer: Identifiable, Equatable, Sendable {
    var id: String { submissionId }
    let submissionId: String
    let sailNumber: String
    let boatLabel: String?
    let activityName: String?
    let finishDisplay: String
    let durationSeconds: Double?
}

struct FleetCompareOverallRow: Equatable, Sendable {
    let metric: String
    let left: String
    let right: String
}

struct FleetCompareLegRow: Equatable, Sendable, Identifiable {
    var id: String { "\(legNo)-\(route)" }
    let legNo: String
    let route: String
    let leftDuration: String
    let rightDuration: String
    let deltaLabel: String
}

struct FleetCompareResult: Equatable, Sendable {
    let leftLabel: String
    let rightLabel: String
    let overall: [FleetCompareOverallRow]
    let legs: [FleetCompareLegRow]
}
