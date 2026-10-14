import XCTest
@testable import KnockDeckCore

final class TapEngineTests: XCTestCase {
    func testImpactDetectorRejectsRestingGravityAndFindsImpulse() {
        let detector = ImpactDetector(threshold: 0.15, refractoryPeriod: 0.08)

        XCTAssertNil(detector.ingest(MotionSample(timestamp: 0.0, accelX: 0, accelY: 0, accelZ: 1.0)))
        let impact = detector.ingest(MotionSample(timestamp: 0.10, accelX: 0.35, accelY: 0.0, accelZ: 1.25, gyroX: 20))

        XCTAssertNotNil(impact)
        XCTAssertGreaterThan(impact?.strength ?? 0, 0.15)
    }

    func testImpactDetectorAppliesRefractoryPeriod() {
        let detector = ImpactDetector(threshold: 0.10, refractoryPeriod: 0.10)
        let sampleA = MotionSample(timestamp: 1.00, accelX: 0.4, accelY: 0, accelZ: 1.2)
        let sampleB = MotionSample(timestamp: 1.04, accelX: 0.5, accelY: 0, accelZ: 1.2)
        let sampleC = MotionSample(timestamp: 1.12, accelX: 0.5, accelY: 0, accelZ: 1.2)

        XCTAssertNotNil(detector.ingest(sampleA))
        XCTAssertNil(detector.ingest(sampleB))
        XCTAssertNotNil(detector.ingest(sampleC))
    }

    func testDoubleTapEmitsAfterGap() {
        let recognizer = TapSequenceRecognizer(maxTapGap: 0.40, maximumCount: 3)
        XCTAssertNil(recognizer.ingest(TapImpact(timestamp: 0.00, side: .left, strength: 0.2)))
        XCTAssertNil(recognizer.ingest(TapImpact(timestamp: 0.22, side: .left, strength: 0.3)))

        let gesture = recognizer.flush(at: 0.63)
        XCTAssertEqual(gesture, TapGesture(side: .left, count: 2, strength: 0.3))
    }

    func testMixedSidesBecomeUnknown() {
        let recognizer = TapSequenceRecognizer(maxTapGap: 0.40, maximumCount: 2)
        XCTAssertNil(recognizer.ingest(TapImpact(timestamp: 0.00, side: .left, strength: 0.2)))
        let gesture = recognizer.ingest(TapImpact(timestamp: 0.20, side: .right, strength: 0.2))

        XCTAssertEqual(gesture?.side, .unknown)
        XCTAssertEqual(gesture?.count, 2)
    }

    func testSideClassifierLearnsOpposingMotionSignatures() {
        var classifier = SideClassifier(ambiguityMargin: 0.01)
        classifier.train(side: .left, features: [
            ImpactFeature(values: [-0.8, 0.1, 0.4, -0.7, 0.1, 0.0]),
            ImpactFeature(values: [-0.9, 0.1, 0.3, -0.8, 0.0, 0.1]),
            ImpactFeature(values: [-0.7, 0.0, 0.4, -0.6, 0.1, 0.0])
        ])
        classifier.train(side: .right, features: [
            ImpactFeature(values: [0.8, 0.1, 0.4, 0.7, 0.1, 0.0]),
            ImpactFeature(values: [0.9, 0.1, 0.3, 0.8, 0.0, 0.1]),
            ImpactFeature(values: [0.7, 0.0, 0.4, 0.6, 0.1, 0.0])
        ])

        XCTAssertTrue(classifier.isCalibrated)
        XCTAssertEqual(classifier.classify(ImpactFeature(values: [-0.85, 0.05, 0.35, -0.75, 0.05, 0.0])), .left)
        XCTAssertEqual(classifier.classify(ImpactFeature(values: [0.85, 0.05, 0.35, 0.75, 0.05, 0.0])), .right)
    }

    func testSideClassifierRefusesToGuessBeforeBothSidesAreLearned() {
        var classifier = SideClassifier()
        classifier.train(side: .left, features: [ImpactFeature(values: [-1, 0, 0, -1, 0, 0])])

        XCTAssertEqual(classifier.classify(ImpactFeature(values: [-1, 0, 0, -1, 0, 0])), .unknown)
    }
}
