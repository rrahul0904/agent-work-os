import AppKit
import CoreAudio
import Foundation
import KnockDeckCore

final class LocalActionExecutor {
    enum ActionError: LocalizedError {
        case noDefaultDevice
        case propertyUnavailable
        case coreAudio(OSStatus)
        case shortcutNameMissing

        var errorDescription: String? {
            switch self {
            case .noDefaultDevice: return "No default audio device is available."
            case .propertyUnavailable: return "This audio device does not expose a writable mute or volume property."
            case .coreAudio(let status): return "CoreAudio returned status \(status)."
            case .shortcutNameMissing: return "Choose an Apple Shortcut name in Settings first."
            }
        }
    }

    private var rememberedInputVolume: Float32 = 1
    private var rememberedOutputVolume: Float32 = 1

    func execute(_ action: KnockAction, shortcutName: String) throws {
        switch action {
        case .toggleMicrophoneMute:
            try toggleAudio(input: true)
        case .toggleSpeakerMute:
            try toggleAudio(input: false)
        case .lockScreen:
            try run("/System/Library/CoreServices/Menu Extras/User.menu/Contents/Resources/CGSession", arguments: ["-suspend"])
        case .runShortcut:
            let name = shortcutName.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !name.isEmpty else { throw ActionError.shortcutNameMissing }
            try run("/usr/bin/shortcuts", arguments: ["run", name])
        case .none:
            break
        }
    }

    private func toggleAudio(input: Bool) throws {
        let device = try defaultDevice(input: input)
        let scope = input ? kAudioObjectPropertyScopeInput : kAudioObjectPropertyScopeOutput

        var muteAddress = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyMute,
            mScope: scope,
            mElement: kAudioObjectPropertyElementMain
        )

        if AudioObjectHasProperty(device, &muteAddress) {
            var settable = DarwinBoolean(false)
            let settableStatus = AudioObjectIsPropertySettable(device, &muteAddress, &settable)
            if settableStatus == noErr, settable.boolValue {
                var value: UInt32 = 0
                var size = UInt32(MemoryLayout<UInt32>.size)
                let readStatus = AudioObjectGetPropertyData(device, &muteAddress, 0, nil, &size, &value)
                guard readStatus == noErr else { throw ActionError.coreAudio(readStatus) }
                var next: UInt32 = value == 0 ? 1 : 0
                let writeStatus = AudioObjectSetPropertyData(device, &muteAddress, 0, nil, size, &next)
                guard writeStatus == noErr else { throw ActionError.coreAudio(writeStatus) }
                return
            }
        }

        try toggleVolumeFallback(device: device, scope: scope, input: input)
    }

    private func defaultDevice(input: Bool) throws -> AudioDeviceID {
        var address = AudioObjectPropertyAddress(
            mSelector: input ? kAudioHardwarePropertyDefaultInputDevice : kAudioHardwarePropertyDefaultOutputDevice,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var device = AudioDeviceID(0)
        var size = UInt32(MemoryLayout<AudioDeviceID>.size)
        let status = AudioObjectGetPropertyData(
            AudioObjectID(kAudioObjectSystemObject),
            &address,
            0,
            nil,
            &size,
            &device
        )
        guard status == noErr, device != 0 else {
            if status != noErr { throw ActionError.coreAudio(status) }
            throw ActionError.noDefaultDevice
        }
        return device
    }

    private func toggleVolumeFallback(
        device: AudioDeviceID,
        scope: AudioObjectPropertyScope,
        input: Bool
    ) throws {
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyVolumeScalar,
            mScope: scope,
            mElement: kAudioObjectPropertyElementMain
        )
        guard AudioObjectHasProperty(device, &address) else { throw ActionError.propertyUnavailable }

        var settable = DarwinBoolean(false)
        let settableStatus = AudioObjectIsPropertySettable(device, &address, &settable)
        guard settableStatus == noErr, settable.boolValue else { throw ActionError.propertyUnavailable }

        var current: Float32 = 0
        var size = UInt32(MemoryLayout<Float32>.size)
        let readStatus = AudioObjectGetPropertyData(device, &address, 0, nil, &size, &current)
        guard readStatus == noErr else { throw ActionError.coreAudio(readStatus) }

        var target: Float32
        if current > 0.001 {
            if input { rememberedInputVolume = current } else { rememberedOutputVolume = current }
            target = 0
        } else {
            target = input ? max(rememberedInputVolume, 0.25) : max(rememberedOutputVolume, 0.25)
        }

        let writeStatus = AudioObjectSetPropertyData(device, &address, 0, nil, size, &target)
        guard writeStatus == noErr else { throw ActionError.coreAudio(writeStatus) }
    }

    private func run(_ executable: String, arguments: [String]) throws {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = arguments
        try process.run()
    }
}
