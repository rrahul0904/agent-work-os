import Foundation
import IOKit
import IOKit.hid
import KnockDeckCore

final class SPUMotionSensor {
    enum SensorError: LocalizedError {
        case accelerometerUnavailable
        case accelerometerOpenFailed(IOReturn)

        var errorDescription: String? {
            switch self {
            case .accelerometerUnavailable:
                return "No compatible Apple SPU accelerometer was found on this Mac."
            case .accelerometerOpenFailed(let code):
                return String(format: "The SPU accelerometer could not be opened (0x%08x).", code)
            }
        }
    }

    private enum SensorKind {
        case accelerometer
        case gyroscope
    }

    private final class CallbackContext {
        weak var owner: SPUMotionSensor?
        let kind: SensorKind

        init(owner: SPUMotionSensor, kind: SensorKind) {
            self.owner = owner
            self.kind = kind
        }
    }

    var onSample: ((MotionSample) -> Void)?

    private let usagePage: UInt32 = 0xFF00
    private let accelerometerUsage: UInt32 = 3
    private let gyroscopeUsage: UInt32 = 9
    private let expectedReportLength = 22
    private let reportDataOffset = 6
    private let reportScale = 65_536.0
    private let reportBufferSize = 4_096

    private var accelerometer: IOHIDDevice?
    private var gyroscope: IOHIDDevice?
    private var accelerometerBuffer: UnsafeMutablePointer<UInt8>?
    private var gyroscopeBuffer: UnsafeMutablePointer<UInt8>?
    private var accelerometerContext: CallbackContext?
    private var gyroscopeContext: CallbackContext?
    private var latestGyro = (x: 0.0, y: 0.0, z: 0.0)
    private(set) var isRunning = false

    deinit {
        stop()
    }

    func start() throws {
        guard !isRunning else { return }
        wakeSPUDriversBestEffort()

        guard let accelerometerService = findDevice(usage: accelerometerUsage) else {
            throw SensorError.accelerometerUnavailable
        }
        defer { IOObjectRelease(accelerometerService) }

        guard let accel = IOHIDDeviceCreate(kCFAllocatorDefault, accelerometerService) else {
            throw SensorError.accelerometerUnavailable
        }
        let result = IOHIDDeviceOpen(accel, IOOptionBits(kIOHIDOptionsTypeNone))
        guard result == kIOReturnSuccess else {
            throw SensorError.accelerometerOpenFailed(result)
        }
        accelerometer = accel

        if let gyroService = findDevice(usage: gyroscopeUsage) {
            defer { IOObjectRelease(gyroService) }
            if let gyro = IOHIDDeviceCreate(kCFAllocatorDefault, gyroService),
               IOHIDDeviceOpen(gyro, IOOptionBits(kIOHIDOptionsTypeNone)) == kIOReturnSuccess {
                gyroscope = gyro
            }
        }

        registerCallback(for: accel, kind: .accelerometer)
        if let gyroscope {
            registerCallback(for: gyroscope, kind: .gyroscope)
        }

        IOHIDDeviceScheduleWithRunLoop(accel, CFRunLoopGetMain(), kCFRunLoopCommonModes)
        if let gyroscope {
            IOHIDDeviceScheduleWithRunLoop(gyroscope, CFRunLoopGetMain(), kCFRunLoopCommonModes)
        }
        isRunning = true
    }

    func stop() {
        guard isRunning || accelerometer != nil || gyroscope != nil else { return }

        if let accelerometer {
            IOHIDDeviceUnscheduleFromRunLoop(accelerometer, CFRunLoopGetMain(), kCFRunLoopCommonModes)
            IOHIDDeviceClose(accelerometer, IOOptionBits(kIOHIDOptionsTypeNone))
        }
        if let gyroscope {
            IOHIDDeviceUnscheduleFromRunLoop(gyroscope, CFRunLoopGetMain(), kCFRunLoopCommonModes)
            IOHIDDeviceClose(gyroscope, IOOptionBits(kIOHIDOptionsTypeNone))
        }

        accelerometer = nil
        gyroscope = nil
        accelerometerContext = nil
        gyroscopeContext = nil
        accelerometerBuffer?.deallocate()
        gyroscopeBuffer?.deallocate()
        accelerometerBuffer = nil
        gyroscopeBuffer = nil
        latestGyro = (0, 0, 0)
        isRunning = false
    }

    private func registerCallback(for device: IOHIDDevice, kind: SensorKind) {
        let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: reportBufferSize)
        buffer.initialize(repeating: 0, count: reportBufferSize)
        let context = CallbackContext(owner: self, kind: kind)

        let callback: IOHIDReportCallback = { contextPointer, _, _, _, _, report, reportLength in
            guard let contextPointer else { return }
            let context = Unmanaged<CallbackContext>.fromOpaque(contextPointer).takeUnretainedValue()
            context.owner?.handle(report: report, length: reportLength, kind: context.kind)
        }

        IOHIDDeviceRegisterInputReportCallback(
            device,
            buffer,
            reportBufferSize,
            callback,
            Unmanaged.passUnretained(context).toOpaque()
        )

        switch kind {
        case .accelerometer:
            accelerometerBuffer = buffer
            accelerometerContext = context
        case .gyroscope:
            gyroscopeBuffer = buffer
            gyroscopeContext = context
        }
    }

    private func handle(report: UnsafePointer<UInt8>, length: CFIndex, kind: SensorKind) {
        guard length >= expectedReportLength else { return }
        let x = Double(readInt32LE(report, offset: reportDataOffset)) / reportScale
        let y = Double(readInt32LE(report, offset: reportDataOffset + 4)) / reportScale
        let z = Double(readInt32LE(report, offset: reportDataOffset + 8)) / reportScale

        switch kind {
        case .gyroscope:
            latestGyro = (x, y, z)
        case .accelerometer:
            onSample?(MotionSample(
                timestamp: ProcessInfo.processInfo.systemUptime,
                accelX: x,
                accelY: y,
                accelZ: z,
                gyroX: latestGyro.x,
                gyroY: latestGyro.y,
                gyroZ: latestGyro.z
            ))
        }
    }

    private func findDevice(usage: UInt32) -> io_service_t? {
        guard let matching = IOServiceMatching("AppleSPUHIDDevice") else { return nil }
        var iterator: io_iterator_t = 0
        guard IOServiceGetMatchingServices(kIOMainPortDefault, matching, &iterator) == kIOReturnSuccess else {
            return nil
        }
        defer { IOObjectRelease(iterator) }

        while true {
            let service = IOIteratorNext(iterator)
            if service == 0 { return nil }

            let page = numberProperty(service, key: "PrimaryUsagePage")
            let primaryUsage = numberProperty(service, key: "PrimaryUsage")
            let reportSize = numberProperty(service, key: "MaxInputReportSize")
            let matches = page == usagePage && primaryUsage == usage && reportSize == UInt32(expectedReportLength)
            if matches {
                return service
            }
            IOObjectRelease(service)
        }
    }

    private func numberProperty(_ service: io_service_t, key: String) -> UInt32? {
        guard let unmanaged = IORegistryEntryCreateCFProperty(
            service,
            key as CFString,
            kCFAllocatorDefault,
            IOOptionBits(kNilOptions)
        ) else { return nil }
        let value = unmanaged.takeRetainedValue()
        return (value as? NSNumber)?.uint32Value
    }

    private func wakeSPUDriversBestEffort() {
        guard let matching = IOServiceMatching("AppleSPUHIDDriver") else { return }
        var iterator: io_iterator_t = 0
        guard IOServiceGetMatchingServices(kIOMainPortDefault, matching, &iterator) == kIOReturnSuccess else {
            return
        }
        defer { IOObjectRelease(iterator) }

        while true {
            let service = IOIteratorNext(iterator)
            if service == 0 { break }
            let enabled = NSNumber(value: 1)
            let interval = NSNumber(value: 1_250)
            _ = IORegistryEntrySetCFProperty(service, "SensorPropertyReportingState" as CFString, enabled)
            _ = IORegistryEntrySetCFProperty(service, "SensorPropertyPowerState" as CFString, enabled)
            _ = IORegistryEntrySetCFProperty(service, "ReportInterval" as CFString, interval)
            IOObjectRelease(service)
        }
    }

    private func readInt32LE(_ bytes: UnsafePointer<UInt8>, offset: Int) -> Int32 {
        let value = UInt32(bytes[offset])
            | (UInt32(bytes[offset + 1]) << 8)
            | (UInt32(bytes[offset + 2]) << 16)
            | (UInt32(bytes[offset + 3]) << 24)
        return Int32(bitPattern: value)
    }
}
