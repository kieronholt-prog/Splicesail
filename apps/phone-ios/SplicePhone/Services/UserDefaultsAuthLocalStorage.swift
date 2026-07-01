import Foundation
import Supabase

/// Persists Supabase auth session in UserDefaults instead of Keychain.
/// Keychain requires Keychain Sharing / a development team; without that, SecItemCopyMatching traps on device.
final class UserDefaultsAuthLocalStorage: AuthLocalStorage, @unchecked Sendable {
    private let defaults: UserDefaults
    private let prefix: String

    init(
        defaults: UserDefaults = .standard,
        prefix: String = "com.compassbox.splicephone.supabase.auth."
    ) {
        self.defaults = defaults
        self.prefix = prefix
    }

    func store(key: String, value: Data) throws {
        defaults.set(value, forKey: prefix + key)
    }

    func retrieve(key: String) throws -> Data? {
        defaults.data(forKey: prefix + key)
    }

    func remove(key: String) throws {
        defaults.removeObject(forKey: prefix + key)
    }
}
