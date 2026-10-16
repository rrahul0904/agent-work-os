import Foundation

public final class ImpactDetector {
    public var threshold: Double
    public var refractoryPeriod: TimeInterval
    private var lastImpactAt: TimeInterval = -.greatestFiniteMagnitude

    public init(threshold: Double = 0.16, refractoryPeriod: TimeInterval = 0.09) {
        self.threshold = threshold
        self.refractoryPeriod = refractoryPeriod
    }

    public func reset() {
        lastImpactAt = -.greatestFiniteMagnitude
    }

    public func ingest(_ sample: MotionSample) -> DetectedImpact? {
        let norm = sqrt(
            sample.accelX * sample.accelX +
            sample.accelY * sample.accelY +
            sample.accelZ * sample.accelZ
        )
        let strength = abs(norm - 1.0)
        guard strength >= threshold else { return nil }
        guard sample.timestamp - lastImpactAt >= refractoryPeriod else { return nil }
        lastImpactAt = sample.timestamp

        // Gyro is scaled to keep its contribution numerically comparable to acceleration.
        let feature = ImpactFeature(values: [
            sample.accelX,
            sample.accelY,
            sample.accelZ,
            sample.gyroX / 120.0,
            sample.gyroY / 120.0,
            sample.gyroZ / 120.0
        ])
        return DetectedImpact(timestamp: sample.timestamp, strength: strength, feature: feature)
    }
}

public final class TapSequenceRecognizer {
    public var maxTapGap: TimeInterval
    public let maximumCount: Int
    private var pending: [TapImpact] = []

    public init(maxTapGap: TimeInterval = 0.42, maximumCount: Int = 3) {
        self.maxTapGap = maxTapGap
        self.maximumCount = max(1, maximumCount)
    }

    public func reset() {
        pending.removeAll(keepingCapacity: true)
    }

    public func ingest(_ impact: TapImpact) -> TapGesture? {
        if let last = pending.last, impact.timestamp - last.timestamp > maxTapGap {
            let gesture = emitPending()
            pending = [impact]
            return gesture
        }

        pending.append(impact)
        if pending.count >= maximumCount {
            return emitPending()
        }
        return nil
    }

    public func flush(at timestamp: TimeInterval) -> TapGesture? {
        guard let last = pending.last else { return nil }
        guard timestamp - last.timestamp >= maxTapGap else { return nil }
        return emitPending()
    }

    private func emitPending() -> TapGesture? {
        guard !pending.isEmpty else { return nil }
        let sides = Set(pending.map(\.side).filter { $0 != .unknown })
        let side: TapSide = sides.count == 1 ? sides.first! : .unknown
        let strength = pending.map(\.strength).max() ?? 0
        let gesture = TapGesture(side: side, count: pending.count, strength: strength)
        pending.removeAll(keepingCapacity: true)
        return gesture
    }
}

public struct SideClassifier: Codable, Equatable, Sendable {
    public private(set) var leftCentroid: [Double]?
    public private(set) var rightCentroid: [Double]?
    public var ambiguityMargin: Double

    public init(
        leftCentroid: [Double]? = nil,
        rightCentroid: [Double]? = nil,
        ambiguityMargin: Double = 0.03
    ) {
        self.leftCentroid = leftCentroid
        self.rightCentroid = rightCentroid
        self.ambiguityMargin = ambiguityMargin
    }

    public var isCalibrated: Bool {
        leftCentroid != nil && rightCentroid != nil
    }

    public mutating func clear() {
        leftCentroid = nil
        rightCentroid = nil
    }

    public mutating func train(side: TapSide, features: [ImpactFeature]) {
        guard side == .left || side == .right else { return }
        let usable = features.map(\.values).filter { !$0.isEmpty }
        guard let width = usable.first?.count, usable.allSatisfy({ $0.count == width }) else { return }

        var centroid = [Double](repeating: 0, count: width)
        for vector in usable {
            let normalized = Self.normalized(vector)
            for index in 0..<width {
                centroid[index] += normalized[index]
            }
        }
        centroid = centroid.map { $0 / Double(usable.count) }
        centroid = Self.normalized(centroid)

        if side == .left {
            leftCentroid = centroid
        } else {
            rightCentroid = centroid
        }
    }

    public func classify(_ feature: ImpactFeature) -> TapSide {
        guard let leftCentroid, let rightCentroid else { return .unknown }
        let vector = Self.normalized(feature.values)
        guard vector.count == leftCentroid.count, vector.count == rightCentroid.count else { return .unknown }

        let leftDistance = Self.squaredDistance(vector, leftCentroid)
        let rightDistance = Self.squaredDistance(vector, rightCentroid)
        guard abs(leftDistance - rightDistance) >= ambiguityMargin else { return .unknown }
        return leftDistance < rightDistance ? .left : .right
    }

    private static func normalized(_ vector: [Double]) -> [Double] {
        let length = sqrt(vector.reduce(0) { $0 + ($1 * $1) })
        guard length > 0.000_001 else { return vector }
        return vector.map { $0 / length }
    }

    private static func squaredDistance(_ lhs: [Double], _ rhs: [Double]) -> Double {
        zip(lhs, rhs).reduce(0) { partial, pair in
            let delta = pair.0 - pair.1
            return partial + delta * delta
        }
    }
}
