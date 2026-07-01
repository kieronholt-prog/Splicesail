import Foundation

struct SpliceAuthUser: Equatable, Sendable {
    let id: String
    let email: String
}

protocol SpliceAuthConnectable: AnyObject {
    var currentUser: SpliceAuthUser? { get }
    func restoreSession() async
    func signIn(email: String, password: String) async throws
    func signOut() async throws
    func accessToken() async throws -> String
}

enum SpliceAuthError: LocalizedError, Equatable {
    case notConfigured
    case notSignedIn
    case sessionExpired

    var errorDescription: String? {
        switch self {
        case .notConfigured:
            return "Splice is not configured. Copy SpliceSecrets.example.plist to SpliceSecrets.plist and add your Supabase keys."
        case .notSignedIn:
            return "Sign in to use race tally."
        case .sessionExpired:
            return "Your session expired or was corrupted. Sign out, then sign in again."
        }
    }
}
