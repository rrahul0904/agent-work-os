import Foundation

public struct MotionSample: Equatable, Sendable {
    public let timestamp: TimeInterval
    public let accelX: Double
    public let accelY: Double
    public let accelZ: Double
    public let gyroX: Double
    public let gyroY: Double
    public let gyroZ: Double

    public init(
        timestamp: TimeInterval,
        accelX: Double,
        accelY: Double,
        accelZ: Double,
        gyroX: Double = 0,
        gyroY: Double = 0,
        gyroZ: Double = 0
    ) {
        self.timestamp = timestamp
        self.accelX = accelX
        self.accelY = accelY
        self.accelZ = accelZ
        self.gyroX = gyroX
        self.gyroY = gyroY
        self.gyroZ = gyroZ
    }
}

public struct ImpactFeature: Codable, Equatable, Sendable {
    public let values: [Double]

    public init(values: [Double]) {
        self.values = values
    }
}

public struct DetectedImpact: Equatable, Sendable {
    public let timestamp: TimeInterval
    public let strength: Double
    public let feature: ImpactFeature

    public init(timestamp: TimeInterval, strength: Double, feature: ImpactFeature) {
        self.timestamp = timestamp
        self.strength = strength
        self.feature = feature
    }
}

public enum TapSide: String, Codable, CaseIterable, Hashable, Sendable {
    case left
    case right
    case unknown

    public var title: String {
        switch self {
        case .left: return "Left"
        case .right: return "Right"
        case .unknown: return "Unknown"
        }
    }
}

public struct TapImpact: Equatable, Sendable {
    public let timestamp: TimeInterval
    public let side: TapSide
    public let strength: Double

    public init(timestamp: TimeInterval, side: TapSide, strength: Double) {
        self.timestamp = timestamp
        self.side = side
        self.strength = strength
    }
}

public struct TapGesture: Equatable, Sendable {
    public let side: TapSide
    public let count: Int
    public let strength: Double

    public init(side: TapSide, count: Int, strength: Double) {
        self.side = side
        self.count = count
        self.strength = strength
    }
}

public enum KnockAction: String, Codable, CaseIterable, Identifiable, Sendable {
    case toggleMicrophoneMute
    case toggleSpeakerMute
    case lockScreen
    case runShortcut
    case none

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .toggleMicrophoneMute: return "Toggle microphone mute"
        case .toggleSpeakerMute: return "Toggle speaker mute"
        case .lockScreen: return "Lock screen"
        case .runShortcut: return "Run Apple Shortcut"
        case .none: return "Do nothing"
        }
    }
}

public struct KnockDeckSettings: Codable, Equatable, Sendable {
    public var threshold: Double
    public var maxTapGap: TimeInterval
    public var triggerTapCount: Int
    public var leftAction: KnockAction
    public var rightAction: KnockAction
    public var unknownAction: KnockAction
    public var shortcutName: String
    public var launchListening: Bool

    public init(
        threshold: Double = 0.16,
        maxTapGap: TimeInterval = 0.42,
        triggerTapCount: Int = 2,
        leftAction: KnockAction = .toggleSpeakerMute,
        rightAction: KnockAction = .toggleMicrophoneMute,
        unknownAction: KnockAction = .none,
        shortcutName: String = "",
        launchListening: Bool = true
    ) {
        self.threshold = threshold
        self.maxTapGap = maxTapGap
        self.triggerTapCount = min(3, max(1, triggerTapCount))
        self.leftAction = leftAction
        self.rightAction = rightAction
        self.unknownAction = unknownAction
        self.shortcutName = shortcutName
        self.launchListening = launchListening
    }
}
