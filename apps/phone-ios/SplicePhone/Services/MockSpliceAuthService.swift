import Foundation

@MainActor
final class MockSpliceAuthService: SpliceAuthConnectable {
    var currentUser: SpliceAuthUser?
    var shouldFailSignIn = false

    func restoreSession() async {
        currentUser = SpliceAuthUser(id: "mock-user", email: "sailor@example.com")
    }

    func signIn(email: String, password: String) async throws {
        if shouldFailSignIn {
            throw NSError(domain: "MockSpliceAuth", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "Invalid credentials (mock).",
            ])
        }
        currentUser = SpliceAuthUser(id: "mock-user", email: email)
    }

    func signOut() async throws {
        currentUser = nil
    }

    func accessToken() async throws -> String {
        guard currentUser != nil else { throw SpliceAuthError.notSignedIn }
        return "mock-access-token"
    }
}
