import Foundation

protocol MotionConnectable: AnyObject {
    var sampleStream: AsyncStream<MotionSample> { get }
    func start() async
    func stop() async
    func zeroHeel(at sample: AttitudeSample)
    func zeroTrim(at sample: AttitudeSample)
    func clearZeroOffsets()
}
