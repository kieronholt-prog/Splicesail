import Foundation

@MainActor
final class PostRaceViewModel: ObservableObject {
    @Published private(set) var isSignedIn = false
    @Published private(set) var isLoading = false
    @Published private(set) var seriesGroups: [SeriesResultsGroup] = []
    @Published private(set) var submissions: [TrackSubmissionSummary] = []
    @Published var errorMessage: String?

    private let auth: SpliceAuthConnectable
    private let api: SpliceAPIClient
    private var refreshTask: Task<Void, Never>?

    init(auth: SpliceAuthConnectable) {
        self.auth = auth
        api = SpliceAPIClient(auth: auth)
    }

    func syncAuthState() {
        isSignedIn = auth.currentUser != nil
    }

    func refresh() async {
        syncAuthState()
        guard isSignedIn else {
            seriesGroups = []
            submissions = []
            return
        }
        if let refreshTask {
            await refreshTask.value
            return
        }
        let task = Task { @MainActor in
            isLoading = true
            errorMessage = nil
            defer {
                isLoading = false
                self.refreshTask = nil
            }
            do {
                async let series = api.fetchSeriesResults()
                async let tracks = api.fetchTrackSubmissions()
                do {
                    seriesGroups = try await series
                } catch {
                    let flat = try await api.fetchRecentResults()
                    seriesGroups = Self.seriesGroupsFromRecent(flat)
                }
                do {
                    submissions = Self.sortedSubmissions(try await tracks)
                } catch {
                    submissions = []
                    errorMessage = error.localizedDescription
                }
            } catch {
                errorMessage = error.localizedDescription
            }
        }
        refreshTask = task
        await task.value
    }

    private static func sortedSubmissions(_ rows: [TrackSubmissionSummary]) -> [TrackSubmissionSummary] {
        rows.sorted { lhs, rhs in
            let left = Self.parseSortDate(lhs.sortTimestamp) ?? .distantPast
            let right = Self.parseSortDate(rhs.sortTimestamp) ?? .distantPast
            return left > right
        }
    }

    private static func parseSortDate(_ iso: String) -> Date? {
        let trimmed = iso.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        let withFractional = ISO8601DateFormatter()
        withFractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = withFractional.date(from: trimmed) { return date }
        let standard = ISO8601DateFormatter()
        standard.formatOptions = [.withInternetDateTime]
        return standard.date(from: trimmed)
    }

    private static func seriesGroupsFromRecent(_ rows: [RecentRaceResult]) -> [SeriesResultsGroup] {
        var grouped: [String: SeriesResultsGroup] = [:]
        for row in rows {
            let race = SeriesRaceResult(
                raceId: row.raceId,
                raceName: row.raceName,
                scheduledAt: row.scheduledAt,
                raceEntryId: row.raceEntryId,
                boatId: row.boatId,
                sailNumber: row.sailNumber,
                boatLabel: row.boatLabel,
                finishDisplay: row.finishDisplay,
                trackSubmissionId: row.trackSubmissionId,
                trackStatus: row.trackStatus
            )
            if var existing = grouped[row.seriesId] {
                existing = SeriesResultsGroup(
                    seriesId: existing.seriesId,
                    seriesName: existing.seriesName,
                    groupId: existing.groupId,
                    clubName: existing.clubName,
                    overallRank: existing.overallRank,
                    overallOf: existing.overallOf,
                    races: existing.races + [race]
                )
                grouped[row.seriesId] = existing
            } else {
                grouped[row.seriesId] = SeriesResultsGroup(
                    seriesId: row.seriesId,
                    seriesName: row.seriesName,
                    groupId: row.groupId,
                    clubName: row.clubName,
                    overallRank: nil,
                    overallOf: nil,
                    races: [race]
                )
            }
        }
        return grouped.values
            .map { group in
                let races = group.races.sorted { lhs, rhs in
                    let left = parseSortDate(lhs.scheduledAt) ?? .distantPast
                    let right = parseSortDate(rhs.scheduledAt) ?? .distantPast
                    return left > right
                }
                return SeriesResultsGroup(
                    seriesId: group.seriesId,
                    seriesName: group.seriesName,
                    groupId: group.groupId,
                    clubName: group.clubName,
                    overallRank: group.overallRank,
                    overallOf: group.overallOf,
                    races: races
                )
            }
            .sorted { lhs, rhs in
                let left = parseSortDate(lhs.races.first?.scheduledAt ?? "") ?? .distantPast
                let right = parseSortDate(rhs.races.first?.scheduledAt ?? "") ?? .distantPast
                return left > right
            }
    }
}

@MainActor
final class AnalysisDetailViewModel: ObservableObject {
    @Published private(set) var detail: TrackSubmissionDetail?
    @Published private(set) var isLoading = false
    @Published var errorMessage: String?

    private let api: SpliceAPIClient

    init(auth: SpliceAuthConnectable) {
        api = SpliceAPIClient(auth: auth)
    }

    func load(submissionId: String) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            detail = try await api.fetchTrackSubmissionDetail(id: submissionId)
        } catch {
            errorMessage = error.localizedDescription
            detail = nil
        }
    }
}

@MainActor
final class FleetCompareViewModel: ObservableObject {
    @Published private(set) var peers: [FleetAnalysisPeer] = []
    @Published private(set) var mySubmissionId: String?
    @Published private(set) var compareResult: FleetCompareResult?
    @Published private(set) var isLoading = false
    @Published var errorMessage: String?
    @Published var leftSubmissionId = ""
    @Published var rightSubmissionId = ""

    private let api: SpliceAPIClient
    private var raceId = ""

    init(auth: SpliceAuthConnectable) {
        api = SpliceAPIClient(auth: auth)
    }

    func load(raceId: String, raceEntryId: String?) async {
        self.raceId = raceId
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let payload = try await api.fetchFleetAnalyses(raceId: raceId, raceEntryId: raceEntryId)
            peers = payload.peers
            mySubmissionId = payload.mySubmissionId
            leftSubmissionId = payload.mySubmissionId ?? peers.first?.submissionId ?? ""
            rightSubmissionId = peers.first(where: { $0.submissionId != leftSubmissionId })?.submissionId ?? ""
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func runCompare() async {
        guard !raceId.isEmpty, leftSubmissionId != rightSubmissionId else {
            errorMessage = "Pick two different boats."
            return
        }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            compareResult = try await api.compareFleetTracks(
                raceId: raceId,
                leftSubmissionId: leftSubmissionId,
                rightSubmissionId: rightSubmissionId
            )
        } catch {
            errorMessage = error.localizedDescription
            compareResult = nil
        }
    }
}
