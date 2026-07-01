import Foundation
import Supabase

@MainActor
final class SpliceAuthService: SpliceAuthConnectable {
    private(set) var currentUser: SpliceAuthUser?

    private let client: SupabaseClient?

    init() {
        if let url = SpliceConfig.supabaseURL, let key = SpliceConfig.supabaseAnonKey {
            client = SupabaseClient(
                supabaseURL: url,
                supabaseKey: key,
                options: .init(
                    auth: .init(
                        storage: UserDefaultsAuthLocalStorage(),
                        emitLocalSessionAsInitialSession: true
                    )
                )
            )
        } else {
            client = nil
        }
    }

    func restoreSession() async {
        guard let client else { return }
        do {
            let session = try await client.auth.session
            if session.isExpired {
                currentUser = nil
                try? await client.auth.signOut()
            } else {
                currentUser = mapUser(session.user)
            }
        } catch {
            currentUser = nil
        }
    }

    func signIn(email: String, password: String) async throws {
        guard let client else { throw SpliceAuthError.notConfigured }
        let session = try await client.auth.signIn(email: email, password: password)
        currentUser = mapUser(session.user)
    }

    func signOut() async throws {
        guard let client else { throw SpliceAuthError.notConfigured }
        try await client.auth.signOut()
        currentUser = nil
    }

    func accessToken() async throws -> String {
        guard let client else { throw SpliceAuthError.notConfigured }
        do {
            let session = try await client.auth.session
            if session.isExpired {
                currentUser = nil
                try? await client.auth.signOut()
                throw SpliceAuthError.sessionExpired
            }
            return session.accessToken
        } catch let error as SpliceAuthError {
            throw error
        } catch {
            NSLog("SpliceAuth: session read failed — %@", String(describing: error))
            currentUser = nil
            try? await client.auth.signOut()
            throw SpliceAuthError.sessionExpired
        }
    }

    private func mapUser(_ user: User) -> SpliceAuthUser {
        SpliceAuthUser(id: user.id.uuidString, email: user.email ?? "")
    }
}
