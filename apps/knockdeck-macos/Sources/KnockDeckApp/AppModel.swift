import Combine
import Foundation
import KnockDeckCore

@MainActor
final class AppModel: ObservableObject {
    @Published private(set) var isListening = false
    @Published private(set) var statusText = "Ready"
    @Published private(set) var lastGestureText = "No taps yet"
    @Published private(set) var lastStrength: Double = 0
    @Published private(set) var calibrationText = "Calibrate left and right taps for side-aware actions."
    @Published private(set) var isCalibrated = false
    @Published private(set) var settings: KnockDeckSettings

    private let sensor = SPUMotionSensor()
    private let actionExecutor = LocalActionExecutor()
    private let impactDetector: ImpactDetector
    private let recognizer: TapSequenceRecognizer
    private var classifier: SideClassifier
    private var flushTimer: Timer?
    private var calibrationTarget: TapSide?
    private var calibrationFeatures: [ImpactFeature] = []

    private let settingsKey = "knockdeck.settings.v1"
    private let classifierKey = "knockdeck.classifier.v1"

    init() {
        let defaults = UserDefaults.standard
        let loadedSettings: KnockDeckSettings
        if let data = defaults.data(forKey: "knockdeck.settings.v1"),
           let decoded = try? JSONDecoder().decode(KnockDeckSettings.self, from: data) {
            loadedSettings = decoded
        } else {
            loadedSettings = KnockDeckSettings()
        }

        let loadedClassifier: SideClassifier
        if let data = defaults.data(forKey: "knockdeck.classifier.v1"),
           let decoded = try? JSONDecoder().decode(SideClassifier.self, from: data) {
            loadedClassifier = decoded
        } else {
            loadedClassifier = SideClassifier()
        }

        settings = loadedSettings
        classifier = loadedClassifier
        impactDetector = ImpactDetector(threshold: loadedSettings.threshold)
        recognizer = TapSequenceRecognizer(maxTapGap: loadedSettings.maxTapGap)
        isCalibrated = loadedClassifier.isCalibrated

        sensor.onSample = { [weak self] sample in
            Task { @MainActor in
                self?.handle(sample)
            }
        }

        flushTimer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.flushPendingGesture()
            }
        }

        if loadedSettings.launchListening {
            startListening()
        }
    }

    deinit {
        flushTimer?.invalidate()
        sensor.stop()
    }

    func toggleListening() {
        isListening ? stopListening() : startListening()
    }

    func startListening() {
        do {
            try sensor.start()
            isListening = true
            statusText = classifier.isCalibrated
                ? "Listening — side calibration active"
                : "Listening — taps detected, side is unknown until calibrated"
        } catch {
            isListening = false
            statusText = error.localizedDescription
        }
    }

    func stopListening() {
        sensor.stop()
        recognizer.reset()
        isListening = false
        statusText = "Listening paused"
    }

    func setThreshold(_ value: Double) {
        var next = settings
        next.threshold = min(0.60, max(0.04, value))
        settings = next
        impactDetector.threshold = next.threshold
        persistSettings()
    }

    func setTapGap(_ value: Double) {
        var next = settings
        next.maxTapGap = min(0.80, max(0.20, value))
        settings = next
        recognizer.maxTapGap = next.maxTapGap
        persistSettings()
    }

    func setTriggerTapCount(_ count: Int) {
        var next = settings
        next.triggerTapCount = min(3, max(1, count))
        settings = next
        persistSettings()
    }

    func setAction(_ action: KnockAction, for side: TapSide) {
        var next = settings
        switch side {
        case .left: next.leftAction = action
        case .right: next.rightAction = action
        case .unknown: next.unknownAction = action
        }
        settings = next
        persistSettings()
    }

    func setShortcutName(_ name: String) {
        var next = settings
        next.shortcutName = name
        settings = next
        persistSettings()
    }

    func setLaunchListening(_ enabled: Bool) {
        var next = settings
        next.launchListening = enabled
        settings = next
        persistSettings()
    }

    func beginCalibration(for side: TapSide) {
        guard side == .left || side == .right else { return }
        calibrationTarget = side
        calibrationFeatures.removeAll(keepingCapacity: true)
        recognizer.reset()
        calibrationText = "Tap the \(side.title.lowercased()) side 3 times, with a short pause between taps."
        if !isListening {
            startListening()
        }
    }

    func clearCalibration() {
        classifier.clear()
        isCalibrated = false
        calibrationTarget = nil
        calibrationFeatures.removeAll(keepingCapacity: true)
        UserDefaults.standard.removeObject(forKey: classifierKey)
        calibrationText = "Calibration cleared. Calibrate both sides before enabling side-aware actions."
    }

    private func handle(_ sample: MotionSample) {
        guard isListening, let detected = impactDetector.ingest(sample) else { return }
        lastStrength = detected.strength

        if let calibrationTarget {
            calibrationFeatures.append(detected.feature)
            let remaining = max(0, 3 - calibrationFeatures.count)
            if remaining > 0 {
                calibrationText = "Captured \(calibrationFeatures.count)/3 \(calibrationTarget.title.lowercased()) taps. \(remaining) to go."
                return
            }

            classifier.train(side: calibrationTarget, features: calibrationFeatures)
            persistClassifier()
            isCalibrated = classifier.isCalibrated
            calibrationText = isCalibrated
                ? "Calibration complete. Left/right classification is active."
                : "\(calibrationTarget.title) learned. Calibrate the other side next."
            self.calibrationTarget = nil
            calibrationFeatures.removeAll(keepingCapacity: true)
            impactDetector.reset()
            recognizer.reset()
            return
        }

        let side = classifier.classify(detected.feature)
        let impact = TapImpact(timestamp: detected.timestamp, side: side, strength: detected.strength)
        if let gesture = recognizer.ingest(impact) {
            handle(gesture)
        }
    }

    private func flushPendingGesture() {
        guard isListening, calibrationTarget == nil else { return }
        if let gesture = recognizer.flush(at: ProcessInfo.processInfo.systemUptime) {
            handle(gesture)
        }
    }

    private func handle(_ gesture: TapGesture) {
        lastGestureText = "\(gesture.side.title) × \(gesture.count)"
        guard gesture.count == settings.triggerTapCount else { return }

        let action: KnockAction
        switch gesture.side {
        case .left: action = settings.leftAction
        case .right: action = settings.rightAction
        case .unknown: action = settings.unknownAction
        }

        do {
            try actionExecutor.execute(action, shortcutName: settings.shortcutName)
            statusText = action == .none ? "Gesture detected — no action mapped" : "Ran: \(action.title)"
        } catch {
            statusText = error.localizedDescription
        }
    }

    private func persistSettings() {
        guard let data = try? JSONEncoder().encode(settings) else { return }
        UserDefaults.standard.set(data, forKey: settingsKey)
    }

    private func persistClassifier() {
        guard let data = try? JSONEncoder().encode(classifier) else { return }
        UserDefaults.standard.set(data, forKey: classifierKey)
    }
}
