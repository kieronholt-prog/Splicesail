import Foundation

enum SpliceConfig {
    private static let secrets: [String: Any] = {
        guard
            let url = Bundle.main.url(forResource: "SpliceSecrets", withExtension: "plist"),
            let data = try? Data(contentsOf: url),
            let plist = try? PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any]
        else {
            return [:]
        }
        return plist
    }()

    static var supabaseURL: URL? {
        stringValue("SUPABASE_URL").flatMap(URL.init(string:))
    }

    static var supabaseAnonKey: String? {
        stringValue("SUPABASE_ANON_KEY")
    }

    static var apiBaseURL: URL? {
        normalizedAPIBaseURL(stringValue("SPLICE_API_BASE_URL") ?? "https://splicesail.com")
    }

    static var isConfigured: Bool {
        supabaseURL != nil && supabaseAnonKey != nil && apiBaseURL != nil
    }

    private static func stringValue(_ key: String) -> String? {
        let value = secrets[key] as? String
        let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !trimmed.isEmpty, !trimmed.contains("YOUR_") else { return nil }
        return trimmed
    }

    /// API root only — rejects accidental under-development / bypass URLs pasted into secrets.
    static func normalizedAPIBaseURL(_ raw: String) -> URL? {
        var trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if let range = trimmed.range(of: "/under-development") {
            trimmed = String(trimmed[..<range.lowerBound])
        }
        if !trimmed.lowercased().hasPrefix("http://"), !trimmed.lowercased().hasPrefix("https://") {
            trimmed = "https://" + trimmed
        }
        guard var components = URLComponents(string: trimmed) else { return nil }
        components.path = ""
        components.query = nil
        components.fragment = nil
        return components.url
    }
}
