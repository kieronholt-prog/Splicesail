import UIKit

/// Handles Garmin Connect deep links when returning from device selection.
/// SwiftUI `.onOpenURL` alone is unreliable when the app resumes from background.
final class ConnectIQAppDelegate: NSObject, UIApplicationDelegate {
    var onOpenURL: ((URL) -> Void)?

    func application(
        _ application: UIApplication,
        open url: URL,
        options: [UIApplication.OpenURLOptionsKey: Any] = [:]
    ) -> Bool {
        let source = options[.sourceApplication] as? String ?? "unknown"
        NSLog("PhoneLink: received URL from %@ — %@", source, url.absoluteString)
        onOpenURL?(url)
        return true
    }
}
