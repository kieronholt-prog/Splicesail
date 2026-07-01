import Foundation

enum HeadingNormalizer {
    static func normaliseHeading(_ raw: Double) -> Double {
        let wrapped = raw.truncatingRemainder(dividingBy: 360)
        let positive = wrapped < 0 ? wrapped + 360 : wrapped
        return positive.truncatingRemainder(dividingBy: 360)
    }
}
