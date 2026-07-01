import Foundation

/// Last mobile API status — shown on the Race tab and printed to the Xcode console.
enum SpliceAPIDiagnostic {
    private(set) static var lastLine: String = "No API call yet — open Race tab and tap Refresh."

    static var onUpdate: ((String) -> Void)?

    static func record(_ line: String) {
        lastLine = line
        // `print` shows in Xcode's debug console; easier to spot than NSLog in system noise.
        print("SpliceAPI: \(line)")
        if let onUpdate {
            DispatchQueue.main.async {
                onUpdate(line)
            }
        }
    }
}
