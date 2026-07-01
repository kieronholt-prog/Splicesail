import ConnectIQ
import Foundation

@MainActor
final class ConnectIQDeviceStore {
    static let shared = ConnectIQDeviceStore()

    private let storageKey = "com.compassbox.splicephone.ciq.devices"
    private(set) var devices: [IQDevice] = []

    private init() {
        restore()
    }

    func handleOpenURL(_ url: URL) -> Bool {
        NSLog("PhoneLink: parsing device-selection URL — %@", url.absoluteString)
        guard let parsed = ConnectIQ.sharedInstance().parseDeviceSelectionResponse(from: url) as? [IQDevice] else {
            NSLog("PhoneLink: parseDeviceSelectionResponse returned nil")
            return false
        }
        guard !parsed.isEmpty else {
            NSLog("PhoneLink: device-selection response was empty")
            return false
        }
        devices = parsed
        save()
        for device in devices {
            NSLog(
                "PhoneLink: saved device %@ (%@)",
                device.friendlyName ?? "watch",
                device.uuid?.uuidString ?? "no-uuid"
            )
        }
        return true
    }

    var primaryDevice: IQDevice? {
        devices.first
    }

    private func save() {
        do {
            let data = try NSKeyedArchiver.archivedData(
                withRootObject: devices,
                requiringSecureCoding: true
            )
            UserDefaults.standard.set(data, forKey: storageKey)
        } catch {
            NSLog("PhoneLink: failed to save devices — %@", error.localizedDescription)
        }
    }

    private func restore() {
        guard let data = UserDefaults.standard.data(forKey: storageKey) else {
            return
        }
        do {
            let allowed: [AnyClass] = [NSArray.self, IQDevice.self, NSString.self, NSUUID.self]
            if let restored = try NSKeyedUnarchiver.unarchivedObject(ofClasses: allowed, from: data) as? [IQDevice] {
                devices = restored
                NSLog("PhoneLink: restored %d Garmin device(s)", devices.count)
            }
        } catch {
            NSLog("PhoneLink: failed to restore devices — %@", error.localizedDescription)
        }
    }
}
