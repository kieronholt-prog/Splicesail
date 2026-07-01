import Foundation

enum SpliceAPIError: LocalizedError {
    case notConfigured
    case invalidResponse
    case server(String)

    var errorDescription: String? {
        switch self {
        case .notConfigured:
            return SpliceAuthError.notConfigured.errorDescription
        case .invalidResponse:
            return "Unexpected response from Splice."
        case let .server(message):
            return message
        }
    }
}

struct SpliceAPIClient {
    private let auth: SpliceAuthConnectable
    private let session: URLSession

    init(auth: SpliceAuthConnectable, session: URLSession = .shared) {
        self.auth = auth
        self.session = session
    }

    func fetchNextRace() async throws -> NextRacePayload? {
        do {
            let data = try await authorizedGET(path: "/api/mobile/next-race")
            let payload = try NextRaceResponseParser.parse(data: data)
            if let payload {
                SpliceAPIDiagnostic.record("Loaded race — \(payload.boats.count) boat(s)")
            } else {
                SpliceAPIDiagnostic.record("No race today (API returned race: null)")
            }
            return payload
        } catch let error as SpliceAPIError {
            SpliceAPIDiagnostic.record("Failed — \(error.localizedDescription ?? "API error")")
            throw error
        } catch let error as SpliceAuthError {
            SpliceAPIDiagnostic.record("Failed — \(error.localizedDescription ?? "auth error")")
            throw error
        } catch {
            SpliceAPIDiagnostic.record("Failed — \(error.localizedDescription)")
            throw SpliceAPIError.server(error.localizedDescription)
        }
    }

    func tallyAfloat(
        groupId: String,
        seriesId: String,
        raceId: String,
        boatId: String
    ) async throws -> String {
        try await postTally(
            body: [
                "groupId": groupId,
                "seriesId": seriesId,
                "raceId": raceId,
                "boatId": boatId,
                "which": "afloat",
            ],
            requireEntryId: true
        )
    }

    func tallyAshore(
        groupId: String,
        seriesId: String,
        raceId: String,
        boatId: String,
        outcome: String
    ) async throws -> String {
        try await postTally(
            body: [
                "groupId": groupId,
                "seriesId": seriesId,
                "raceId": raceId,
                "boatId": boatId,
                "which": "ashore",
                "outcome": outcome,
            ],
            requireEntryId: true
        )
    }

    func undoTallyAfloat(
        groupId: String,
        seriesId: String,
        raceId: String,
        boatId: String
    ) async throws {
        _ = try await postTally(
            body: [
                "groupId": groupId,
                "seriesId": seriesId,
                "raceId": raceId,
                "boatId": boatId,
                "which": "undo_afloat",
            ],
            requireEntryId: false
        )
    }

    func fetchSeriesResults() async throws -> [SeriesResultsGroup] {
        let data = try await authorizedGET(path: "/api/mobile/series-results")
        guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              NextRaceResponseParser.bool(root, keys: ["ok"]) == true,
              let rows = root["series"] as? [[String: Any]] else {
            throw SpliceAPIError.invalidResponse
        }
        return rows.compactMap { Self.parseSeriesGroup($0) }
    }

    func fetchRecentResults() async throws -> [RecentRaceResult] {
        let data = try await authorizedGET(path: "/api/mobile/recent-results")
        guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              NextRaceResponseParser.bool(root, keys: ["ok"]) == true,
              let rows = root["results"] as? [[String: Any]] else {
            throw SpliceAPIError.invalidResponse
        }
        return rows.compactMap { Self.parseRecentResult($0) }
    }

    func fetchTrackSubmissions() async throws -> [TrackSubmissionSummary] {
        let data = try await authorizedGET(path: "/api/mobile/track-submissions")
        guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              NextRaceResponseParser.bool(root, keys: ["ok"]) == true,
              let rows = root["submissions"] as? [[String: Any]] else {
            if let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let message = NextRaceResponseParser.string(root, keys: ["error"]) {
                throw SpliceAPIError.server(message)
            }
            throw SpliceAPIError.invalidResponse
        }
        let parsed = rows.compactMap { Self.parseTrackSubmission($0) }
        let count = NextRaceResponseParser.int(root, keys: ["count"]) ?? parsed.count
        SpliceAPIDiagnostic.record("Loaded \(count) track(s) for analysis")
        if rows.count > 0, parsed.isEmpty {
            SpliceAPIDiagnostic.record("Warning — track rows returned but none parsed")
        }
        return parsed
    }

    func fetchTrackSubmissionDetail(id: String) async throws -> TrackSubmissionDetail {
        let path = "/api/mobile/track-submissions?id=\(id.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? id)"
        let data = try await authorizedGET(path: path)
        guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              NextRaceResponseParser.bool(root, keys: ["ok"]) == true,
              let sub = root["submission"] as? [String: Any] else {
            throw SpliceAPIError.invalidResponse
        }
        guard let detail = Self.parseTrackDetail(sub) else {
            throw SpliceAPIError.invalidResponse
        }
        return detail
    }

    func registerTrackSession(
        raceEntryId: String,
        activityStartedAt: Date,
        activityEndedAt: Date,
        activityName: String?,
        localSessionId: String
    ) async throws -> String {
        var body: [String: String] = [
            "raceEntryId": raceEntryId,
            "activityStartedAt": Self.isoString(activityStartedAt),
            "activityEndedAt": Self.isoString(activityEndedAt),
            "localSessionId": localSessionId,
        ]
        if let activityName, !activityName.isEmpty {
            body["activityName"] = activityName
        }
        let data = try await authorizedPOST(path: "/api/mobile/tracks", json: body)
        guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw SpliceAPIError.invalidResponse
        }
        guard NextRaceResponseParser.bool(root, keys: ["ok"]) == true,
              let submissionId = NextRaceResponseParser.string(root, keys: ["submissionId", "submission_id"]) else {
            let message = NextRaceResponseParser.string(root, keys: ["error"]) ?? "Track registration failed."
            throw SpliceAPIError.server(message)
        }
        return submissionId
    }

    func fetchFleetAnalyses(raceId: String, raceEntryId: String?) async throws -> (peers: [FleetAnalysisPeer], mySubmissionId: String?) {
        var path = "/api/mobile/races/\(raceId)/fleet-analyses"
        if let raceEntryId, !raceEntryId.isEmpty {
            let encoded = raceEntryId.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? raceEntryId
            path += "?raceEntryId=\(encoded)"
        }
        let data = try await authorizedGET(path: path)
        guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              NextRaceResponseParser.bool(root, keys: ["ok"]) == true,
              let peerRows = root["peers"] as? [[String: Any]] else {
            throw SpliceAPIError.invalidResponse
        }
        let peers = peerRows.compactMap { Self.parseFleetPeer($0) }
        let myId = NextRaceResponseParser.string(root, keys: ["mySubmissionId", "my_submission_id"])
        return (peers, myId)
    }

    func compareFleetTracks(
        raceId: String,
        leftSubmissionId: String,
        rightSubmissionId: String
    ) async throws -> FleetCompareResult {
        let data = try await authorizedPOST(
            path: "/api/mobile/races/\(raceId)/fleet-analyses",
            json: [
                "leftSubmissionId": leftSubmissionId,
                "rightSubmissionId": rightSubmissionId,
            ]
        )
        guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              NextRaceResponseParser.bool(root, keys: ["ok"]) == true,
              let compare = root["compare"] as? [String: Any] else {
            throw SpliceAPIError.invalidResponse
        }
        return Self.parseCompareResult(compare)
    }

    private static func isoString(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }

    private static func parseSeriesGroup(_ dict: [String: Any]) -> SeriesResultsGroup? {
        guard let seriesId = NextRaceResponseParser.string(dict, keys: ["seriesId", "series_id"]),
              let seriesName = NextRaceResponseParser.string(dict, keys: ["seriesName", "series_name"]) else {
            return nil
        }
        let raceRows = (dict["races"] as? [[String: Any]]) ?? []
        let races = raceRows.compactMap { parseSeriesRace($0) }
        let overall = dict["overallPosition"] as? [String: Any]
            ?? dict["overall_position"] as? [String: Any]
        return SeriesResultsGroup(
            seriesId: seriesId,
            seriesName: seriesName,
            groupId: NextRaceResponseParser.string(dict, keys: ["groupId", "group_id"]) ?? "",
            clubName: NextRaceResponseParser.optionalString(dict, keys: ["clubName", "club_name"]),
            overallRank: NextRaceResponseParser.int(overall ?? [:], keys: ["rank"]),
            overallOf: NextRaceResponseParser.int(overall ?? [:], keys: ["of"]),
            races: races
        )
    }

    private static func parseSeriesRace(_ dict: [String: Any]) -> SeriesRaceResult? {
        guard let raceEntryId = NextRaceResponseParser.string(dict, keys: ["raceEntryId", "race_entry_id"]),
              let raceId = NextRaceResponseParser.string(dict, keys: ["raceId", "race_id"]) else { return nil }
        return SeriesRaceResult(
            raceId: raceId,
            raceName: NextRaceResponseParser.string(dict, keys: ["raceName", "race_name"]) ?? "Race",
            scheduledAt: NextRaceResponseParser.string(dict, keys: ["scheduledAt", "scheduled_at"]) ?? "",
            raceEntryId: raceEntryId,
            boatId: NextRaceResponseParser.string(dict, keys: ["boatId", "boat_id"]) ?? "",
            sailNumber: NextRaceResponseParser.string(dict, keys: ["sailNumber", "sail_number"]) ?? "—",
            boatLabel: NextRaceResponseParser.optionalString(dict, keys: ["boatLabel", "boat_label"]),
            finishDisplay: NextRaceResponseParser.string(dict, keys: ["finishDisplay", "finish_display"]) ?? "—",
            trackSubmissionId: NextRaceResponseParser.optionalString(dict, keys: ["trackSubmissionId", "track_submission_id"]),
            trackStatus: NextRaceResponseParser.optionalString(dict, keys: ["trackStatus", "track_status"])
        )
    }

    private static func parseRecentResult(_ dict: [String: Any]) -> RecentRaceResult? {
        guard let raceEntryId = NextRaceResponseParser.string(dict, keys: ["raceEntryId", "race_entry_id"]),
              let raceId = NextRaceResponseParser.string(dict, keys: ["raceId", "race_id"]) else { return nil }
        return RecentRaceResult(
            raceId: raceId,
            raceName: NextRaceResponseParser.string(dict, keys: ["raceName", "race_name"]) ?? "Race",
            seriesId: NextRaceResponseParser.string(dict, keys: ["seriesId", "series_id"]) ?? "",
            seriesName: NextRaceResponseParser.string(dict, keys: ["seriesName", "series_name"]) ?? "",
            groupId: NextRaceResponseParser.string(dict, keys: ["groupId", "group_id"]) ?? "",
            clubName: NextRaceResponseParser.optionalString(dict, keys: ["clubName", "club_name"]),
            scheduledAt: NextRaceResponseParser.string(dict, keys: ["scheduledAt", "scheduled_at"]) ?? "",
            raceType: NextRaceResponseParser.string(dict, keys: ["raceType", "race_type"]) ?? "handicap",
            raceEntryId: raceEntryId,
            boatId: NextRaceResponseParser.string(dict, keys: ["boatId", "boat_id"]) ?? "",
            sailNumber: NextRaceResponseParser.string(dict, keys: ["sailNumber", "sail_number"]) ?? "—",
            boatLabel: NextRaceResponseParser.optionalString(dict, keys: ["boatLabel", "boat_label"]),
            outcome: NextRaceResponseParser.optionalString(dict, keys: ["outcome"]),
            finishDisplay: NextRaceResponseParser.string(dict, keys: ["finishDisplay", "finish_display"]) ?? "—",
            trackSubmissionId: NextRaceResponseParser.optionalString(dict, keys: ["trackSubmissionId", "track_submission_id"]),
            trackStatus: NextRaceResponseParser.optionalString(dict, keys: ["trackStatus", "track_status"])
        )
    }

    private static func parseTrackSubmission(_ dict: [String: Any]) -> TrackSubmissionSummary? {
        guard let id = NextRaceResponseParser.string(dict, keys: ["id"]) else { return nil }
        return TrackSubmissionSummary(
            id: id,
            activityName: NextRaceResponseParser.optionalString(dict, keys: ["activityName", "activity_name"]),
            activityStartedAt: NextRaceResponseParser.string(dict, keys: ["activityStartedAt", "activity_started_at"]) ?? "",
            activityEndedAt: NextRaceResponseParser.optionalString(dict, keys: ["activityEndedAt", "activity_ended_at"]),
            status: NextRaceResponseParser.string(dict, keys: ["status"]) ?? "draft",
            trackSource: NextRaceResponseParser.optionalString(dict, keys: ["trackSource", "track_source"]),
            analysisMode: NextRaceResponseParser.optionalString(dict, keys: ["analysisMode", "analysis_mode"]),
            raceId: NextRaceResponseParser.optionalString(dict, keys: ["raceId", "race_id"]),
            raceEntryId: NextRaceResponseParser.optionalString(dict, keys: ["raceEntryId", "race_entry_id"]),
            raceName: NextRaceResponseParser.optionalString(dict, keys: ["raceName", "race_name"]),
            seriesName: NextRaceResponseParser.optionalString(dict, keys: ["seriesName", "series_name"]),
            durationSeconds: NextRaceResponseParser.double(dict, keys: ["durationSeconds", "duration_seconds"]),
            windDirection: NextRaceResponseParser.double(dict, keys: ["windDirection", "wind_direction"]),
            legCount: NextRaceResponseParser.int(dict, keys: ["legCount", "leg_count"]),
            tackCount: NextRaceResponseParser.int(dict, keys: ["tackCount", "tack_count"]),
            gybeCount: NextRaceResponseParser.int(dict, keys: ["gybeCount", "gybe_count"])
        )
    }

    private static func parseTrackDetail(_ dict: [String: Any]) -> TrackSubmissionDetail? {
        guard let summary = parseTrackSubmission(dict) else { return nil }
        let legRows = (dict["legSummary"] as? [[String: Any]]) ?? (dict["leg_summary"] as? [[String: Any]]) ?? []
        let legs = legRows.map { leg in
            AnalysisLegRow(
                legNo: NextRaceResponseParser.string(leg, keys: ["legNo", "leg_no"]) ?? "—",
                from: NextRaceResponseParser.string(leg, keys: ["from"]) ?? "—",
                to: NextRaceResponseParser.string(leg, keys: ["to"]) ?? "—",
                legType: NextRaceResponseParser.string(leg, keys: ["type", "legType"]) ?? "—",
                durationSeconds: NextRaceResponseParser.double(leg, keys: ["duration"])
            )
        }
        let stats = (dict["stats"] as? [String: Any]) ?? [:]
        return TrackSubmissionDetail(
            summary: summary,
            legs: legs,
            durationSeconds: NextRaceResponseParser.double(stats, keys: ["duration"]) ?? summary.durationSeconds,
            tackCount: NextRaceResponseParser.int(stats, keys: ["tackCount", "tack_count"]) ?? summary.tackCount,
            gybeCount: NextRaceResponseParser.int(stats, keys: ["gybeCount", "gybe_count"]) ?? summary.gybeCount,
            windDirection: NextRaceResponseParser.double(dict, keys: ["windDirection", "wind_direction"]) ?? summary.windDirection,
            analysisUrl: NextRaceResponseParser.string(dict, keys: ["analysisUrl", "analysis_url"]) ?? ""
        )
    }

    private static func parseFleetPeer(_ dict: [String: Any]) -> FleetAnalysisPeer? {
        guard let submissionId = NextRaceResponseParser.string(dict, keys: ["submissionId", "submission_id"]) else { return nil }
        return FleetAnalysisPeer(
            submissionId: submissionId,
            sailNumber: NextRaceResponseParser.string(dict, keys: ["sailNumber", "sail_number"]) ?? "—",
            boatLabel: NextRaceResponseParser.optionalString(dict, keys: ["boatLabel", "boat_label"]),
            activityName: NextRaceResponseParser.optionalString(dict, keys: ["activityName", "activity_name"]),
            finishDisplay: NextRaceResponseParser.string(dict, keys: ["finishDisplay", "finish_display"]) ?? "—",
            durationSeconds: NextRaceResponseParser.double(dict, keys: ["durationSeconds", "duration_seconds"])
        )
    }

    private static func parseCompareResult(_ dict: [String: Any]) -> FleetCompareResult {
        let left = dict["left"] as? [String: Any] ?? [:]
        let right = dict["right"] as? [String: Any] ?? [:]
        let overallRows = (dict["overall"] as? [[String: Any]]) ?? []
        let legRows = (dict["legs"] as? [[String: Any]]) ?? []
        return FleetCompareResult(
            leftLabel: NextRaceResponseParser.string(left, keys: ["label"]) ?? "A",
            rightLabel: NextRaceResponseParser.string(right, keys: ["label"]) ?? "B",
            overall: overallRows.map { row in
                FleetCompareOverallRow(
                    metric: NextRaceResponseParser.string(row, keys: ["metric"]) ?? "",
                    left: NextRaceResponseParser.string(row, keys: ["left"]) ?? "—",
                    right: NextRaceResponseParser.string(row, keys: ["right"]) ?? "—"
                )
            },
            legs: legRows.map { leg in
                let leftDur = leg["left"] as? [String: Any]
                let rightDur = leg["right"] as? [String: Any]
                return FleetCompareLegRow(
                    legNo: String(describing: leg["legNo"] ?? leg["leg_no"] ?? "—"),
                    route: NextRaceResponseParser.string(leg, keys: ["route"]) ?? "—",
                    leftDuration: formatDuration(NextRaceResponseParser.double(leftDur ?? [:], keys: ["durationSec", "duration"])),
                    rightDuration: formatDuration(NextRaceResponseParser.double(rightDur ?? [:], keys: ["durationSec", "duration"])),
                    deltaLabel: NextRaceResponseParser.string(leg, keys: ["deltaLabel", "delta_label"]) ?? "—"
                )
            }
        )
    }

    private static func formatDuration(_ seconds: Double?) -> String {
        guard let seconds, seconds.isFinite, seconds >= 0 else { return "—" }
        let m = Int(seconds) / 60
        let s = Int(seconds) % 60
        return "\(m):\(String(format: "%02d", s))"
    }

    private func postTally(body: [String: String], requireEntryId: Bool) async throws -> String {
        let data = try await authorizedPOST(path: "/api/mobile/tally", json: body)
        guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw SpliceAPIError.invalidResponse
        }
        guard NextRaceResponseParser.bool(root, keys: ["ok"]) == true else {
            throw SpliceAPIError.server(NextRaceResponseParser.string(root, keys: ["error"]) ?? "Tally failed.")
        }
        let raceEntryId = NextRaceResponseParser.string(root, keys: ["raceEntryId", "race_entry_id"])
        if requireEntryId, let raceEntryId {
            return raceEntryId
        }
        if requireEntryId {
            throw SpliceAPIError.server("Tally failed — no race entry id returned.")
        }
        return raceEntryId ?? ""
    }

    private func authorizedGET(path: String) async throws -> Data {
        try await authorizedRequest(path: path, method: "GET", json: nil)
    }

    private func authorizedPOST(path: String, json: [String: String]) async throws -> Data {
        try await authorizedRequest(path: path, method: "POST", json: json)
    }

    private func authorizedRequest(
        path: String,
        method: String,
        json: [String: String]?
    ) async throws -> Data {
        guard let base = SpliceConfig.apiBaseURL else {
            SpliceAPIDiagnostic.record("Not configured — check SpliceSecrets.plist")
            throw SpliceAPIError.notConfigured
        }
        guard let url = URL(string: path, relativeTo: base) else { throw SpliceAPIError.invalidResponse }

        SpliceAPIDiagnostic.record("Calling \(url.absoluteString) …")

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        let token = try await auth.accessToken()
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        if let json {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: json)
        }

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw SpliceAPIError.invalidResponse
        }

        SpliceAPIDiagnostic.record("\(method) → HTTP \(http.statusCode), \(data.count) bytes")

        if (200 ..< 300).contains(http.statusCode) {
            return data
        }

        let prefix = String(data: data.prefix(200), encoding: .utf8) ?? ""
        if let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let message = NextRaceResponseParser.string(root, keys: ["error"]) {
            throw SpliceAPIError.server(message)
        }
        throw SpliceAPIError.server("Request failed (\(http.statusCode)). \(prefix)")
    }
}

// MARK: - Flexible JSON parsing (camelCase or snake_case, null-safe)

private enum NextRaceResponseParser {
    static func parse(data: Data) throws -> NextRacePayload? {
        guard !data.isEmpty else {
            throw SpliceAPIError.server("Empty response from Splice API.")
        }

        let prefix = String(data: data.prefix(120), encoding: .utf8) ?? ""
        if prefix.trimmingCharacters(in: .whitespacesAndNewlines).hasPrefix("<") {
            throw SpliceAPIError.server(
                "Received HTML instead of JSON. SPLICE_API_BASE_URL should be https://splicesail.com"
            )
        }

        guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            SpliceAPIDiagnostic.record("Response is not JSON — \(prefix)")
            throw SpliceAPIError.server("Race response was not valid JSON.")
        }

        guard bool(root, keys: ["ok"]) == true else {
            throw SpliceAPIError.server(string(root, keys: ["error"]) ?? "Failed to load race.")
        }

        guard let raceDict = root["race"] as? [String: Any] else {
            return nil
        }

        return parseRace(raceDict)
    }

    private static func parseRace(_ dict: [String: Any]) -> NextRacePayload {
        let scheduledAt = string(dict, keys: ["scheduledAt", "scheduled_at"]) ?? ""
        let clubTimeZone = string(dict, keys: ["clubTimeZone", "club_time_zone"]) ?? "Europe/London"
        let boatDicts = dict["boats"] as? [[String: Any]] ?? []

        let boats = boatDicts.map { parseBoat($0, scheduledAt: scheduledAt) }
            .filter { !$0.boatId.isEmpty }

        return NextRacePayload(
            groupId: string(dict, keys: ["groupId", "group_id"]) ?? "",
            seriesId: string(dict, keys: ["seriesId", "series_id"]) ?? "",
            raceId: string(dict, keys: ["raceId", "race_id"]) ?? "",
            raceName: string(dict, keys: ["raceName", "race_name"]) ?? "Race",
            seriesName: string(dict, keys: ["seriesName", "series_name"]) ?? "Series",
            clubName: string(dict, keys: ["clubName", "club_name"]) ?? "Club",
            scheduledAt: scheduledAt,
            clubTimeZone: clubTimeZone,
            boats: boats
        )
    }

    private static func parseBoat(_ dict: [String: Any], scheduledAt: String) -> TallyBoatRow {
        let tallyAfloatAt = optionalString(dict, keys: ["tallyAfloatAt", "tally_afloat_at"])
        let tallyAshoreAt = optionalString(dict, keys: ["tallyAshoreAt", "tally_ashore_at"])
        let canTallyAshore = bool(dict, keys: ["canTallyAshore", "can_tally_ashore"]) ?? false
        let fleetOffsetMinutes = int(dict, keys: ["fleetOffsetMinutes", "fleet_offset_minutes"]) ?? 0
        let fleetStartUtcStored = string(dict, keys: ["fleetStartUtc", "fleet_start_utc"]) ?? ""
        let fleetStartUtc: String
        if !fleetStartUtcStored.isEmpty {
            fleetStartUtc = fleetStartUtcStored
        } else {
            fleetStartUtc = ClubTimeFormat.fleetStartUtcIso(scheduledAt: scheduledAt, offsetMinutes: fleetOffsetMinutes) ?? ""
        }

        let undoFromAPI = bool(dict, keys: ["canUndoTallyAfloat", "can_undo_tally_afloat"])
        let canUndo = undoFromAPI ?? (tallyAfloatAt != nil && tallyAshoreAt == nil && !canTallyAshore)

        return TallyBoatRow(
            boatId: string(dict, keys: ["boatId", "boat_id"]) ?? "",
            label: optionalString(dict, keys: ["label"]),
            sailNumber: string(dict, keys: ["sailNumber", "sail_number"]) ?? "—",
            classDisplay: string(dict, keys: ["classDisplay", "class_display"]) ?? "—",
            raceEntryId: optionalString(dict, keys: ["raceEntryId", "race_entry_id"]),
            tallyAfloatAt: tallyAfloatAt,
            tallyAshoreAt: tallyAshoreAt,
            outcome: optionalString(dict, keys: ["outcome"]),
            fleetOffsetMinutes: fleetOffsetMinutes,
            fleetStartDisplay: string(dict, keys: ["fleetStartDisplay", "fleet_start_display"]) ?? "—",
            fleetStartUtc: fleetStartUtc,
            fleetStartSource: string(dict, keys: ["fleetStartSource", "fleet_start_source"]) ?? "scheduled_offset",
            canTallyAfloat: bool(dict, keys: ["canTallyAfloat", "can_tally_afloat"]) ?? false,
            canTallyAshore: canTallyAshore,
            canUndoTallyAfloat: canUndo,
            fleetStartPostponed: bool(dict, keys: ["fleetStartPostponed", "fleet_start_postponed"]) ?? false
        )
    }

    static func string(_ dict: [String: Any], keys: [String]) -> String? {
        for key in keys {
            if let value = dict[key] as? String {
                let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
                if !trimmed.isEmpty { return trimmed }
            }
        }
        return nil
    }

    static func optionalString(_ dict: [String: Any], keys: [String]) -> String? {
        for key in keys {
            if dict[key] is NSNull { return nil }
            if let value = dict[key] as? String {
                let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
                return trimmed.isEmpty ? nil : trimmed
            }
        }
        return nil
    }

    static func double(_ dict: [String: Any]?, keys: [String]) -> Double? {
        guard let dict else { return nil }
        for key in keys {
            if let value = dict[key] as? Double { return value }
            if let value = dict[key] as? Int { return Double(value) }
            if let value = dict[key] as? String, let parsed = Double(value) { return parsed }
        }
        return nil
    }

    static func int(_ dict: [String: Any], keys: [String]) -> Int? {
        for key in keys {
            if let value = dict[key] as? Int { return value }
            if let value = dict[key] as? Double { return Int(value.rounded()) }
            if let value = dict[key] as? String, let parsed = Int(value) { return parsed }
        }
        return nil
    }

    static func bool(_ dict: [String: Any], keys: [String]) -> Bool? {
        for key in keys {
            if let value = dict[key] as? Bool { return value }
            if let value = dict[key] as? Int { return value != 0 }
            if let value = dict[key] as? String {
                switch value.lowercased() {
                case "true", "1", "yes": return true
                case "false", "0", "no": return false
                default: continue
                }
            }
        }
        return nil
    }
}
