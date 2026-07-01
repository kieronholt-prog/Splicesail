import Foundation

enum PhoneLinkState: Equatable, Sendable {
    case starting
    case noDevice
    case notConnected
    case connected
    case error(String)
}
