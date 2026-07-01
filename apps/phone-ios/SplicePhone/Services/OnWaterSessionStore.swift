import Foundation

final class OnWaterSessionStore {
    static let shared = OnWaterSessionStore()

    private let fileURL: URL
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    private init() {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let dir = support.appendingPathComponent("SplicePhone", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        fileURL = dir.appendingPathComponent("on_water_session.json")
        encoder.dateEncodingStrategy = .iso8601
        decoder.dateDecodingStrategy = .iso8601
    }

    func load() -> OnWaterSession? {
        guard let data = try? Data(contentsOf: fileURL) else { return nil }
        return try? decoder.decode(OnWaterSession.self, from: data)
    }

    func save(_ session: OnWaterSession?) {
        guard let session else {
            try? FileManager.default.removeItem(at: fileURL)
            return
        }
        guard let data = try? encoder.encode(session) else { return }
        try? data.write(to: fileURL, options: .atomic)
    }
}
