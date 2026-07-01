import Foundation

/// V2 JSON sidecar for high-rate attitude (+ optional wind). See docs/track-session-v2.md.
struct AttitudeLogSample: Codable, Sendable {
    let t: Double
    let hdg: Int?
    let heel: Int
    let trim: Int
    let turn: Double
    var wind: Double?
}

struct AttitudeLogEvent: Codable, Sendable {
    let t: Double
    let type: String
}

private struct AttitudeLogFile: Codable {
    var sessionId: UUID
    var raceEntryId: String?
    var samples: [AttitudeLogSample]
    var events: [AttitudeLogEvent]
}

final class SessionAttitudeRecorder {
    private let fileManager = FileManager.default
    private var buffer: [AttitudeLogSample] = []
    private var events: [AttitudeLogEvent] = []
    private var sessionId: UUID?
    private var raceEntryId: String?
    private var lastWindDegrees: Double?
    private var lastFlush = Date()

    private var logsDirectory: URL {
        let base = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? fileManager.temporaryDirectory
        let dir = base.appendingPathComponent("SplicePhone", isDirectory: true)
        if !fileManager.fileExists(atPath: dir.path) {
            try? fileManager.createDirectory(at: dir, withIntermediateDirectories: true)
        }
        return dir
    }

    func begin(sessionId: UUID, raceEntryId: String?) {
        self.sessionId = sessionId
        self.raceEntryId = raceEntryId
        buffer = []
        events = []
        lastFlush = Date()
    }

    func ingest(_ sample: AttitudeSample, windDegrees: Double?) {
        guard sessionId != nil else { return }
        if let windDegrees {
            lastWindDegrees = windDegrees
        }
        buffer.append(
            AttitudeLogSample(
                t: sample.publishTimestamp,
                hdg: sample.headingDegrees,
                heel: sample.heelDegrees,
                trim: sample.trimDegrees,
                turn: sample.turnDegreesPerSecond,
                wind: lastWindDegrees
            )
        )
        flushIfNeeded(force: buffer.count >= 120)
    }

    func logEvent(type: String, at date: Date = Date()) {
        guard sessionId != nil else { return }
        events.append(AttitudeLogEvent(t: date.timeIntervalSince1970, type: type))
        flushIfNeeded(force: true)
    }

    func finish() {
        flushIfNeeded(force: true)
        sessionId = nil
        raceEntryId = nil
        buffer = []
        events = []
    }

    func fileURL(for sessionId: UUID) -> URL {
        logsDirectory.appendingPathComponent("session-\(sessionId.uuidString)-attitude.json")
    }

    private func flushIfNeeded(force: Bool) {
        guard let sessionId else { return }
        let elapsed = Date().timeIntervalSince(lastFlush)
        guard force || elapsed >= 5 || buffer.count >= 60 else { return }

        let url = fileURL(for: sessionId)
        var existing = AttitudeLogFile(sessionId: sessionId, raceEntryId: raceEntryId, samples: [], events: [])
        if let data = try? Data(contentsOf: url),
           let decoded = try? JSONDecoder().decode(AttitudeLogFile.self, from: data) {
            existing = decoded
        }
        existing.raceEntryId = raceEntryId ?? existing.raceEntryId
        existing.samples.append(contentsOf: buffer)
        existing.events.append(contentsOf: events)
        buffer = []
        events = []

        if let data = try? JSONEncoder().encode(existing) {
            try? data.write(to: url, options: .atomic)
        }
        lastFlush = Date()
    }
}
