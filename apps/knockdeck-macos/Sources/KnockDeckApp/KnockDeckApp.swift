import SwiftUI
import KnockDeckCore

@main
struct KnockDeckApp: App {
    @StateObject private var model = AppModel()

    var body: some Scene {
        MenuBarExtra {
            MenuContent(model: model)
                .frame(width: 340)
                .padding(14)
        } label: {
            Label("KnockDeck", systemImage: model.isListening ? "hand.tap.fill" : "hand.tap")
        }
        .menuBarExtraStyle(.window)

        Settings {
            SettingsView(model: model)
                .frame(minWidth: 560, minHeight: 560)
                .padding(22)
        }
    }
}

private struct MenuContent: View {
    @ObservedObject var model: AppModel

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text("KnockDeck")
                        .font(.headline)
                    Text(model.statusText)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
                Spacer()
                Circle()
                    .fill(model.isListening ? Color.green : Color.secondary)
                    .frame(width: 9, height: 9)
            }

            Divider()

            HStack {
                VStack(alignment: .leading) {
                    Text("Last gesture")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(model.lastGestureText)
                        .font(.body.monospacedDigit())
                }
                Spacer()
                VStack(alignment: .trailing) {
                    Text("Impact")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(model.lastStrength, format: .number.precision(.fractionLength(3)))
                        .font(.body.monospacedDigit())
                }
            }

            Button(model.isListening ? "Pause listening" : "Start listening") {
                model.toggleListening()
            }
            .buttonStyle(.borderedProminent)
            .frame(maxWidth: .infinity)

            SettingsLink {
                Label("Settings & calibration", systemImage: "slider.horizontal.3")
            }
            .frame(maxWidth: .infinity)

            Button("Quit KnockDeck") {
                NSApplication.shared.terminate(nil)
            }
            .frame(maxWidth: .infinity)
        }
    }
}

private struct SettingsView: View {
    @ObservedObject var model: AppModel

    var body: some View {
        Form {
            Section("Detection") {
                HStack {
                    Text("Sensitivity threshold")
                    Slider(
                        value: Binding(
                            get: { model.settings.threshold },
                            set: { model.setThreshold($0) }
                        ),
                        in: 0.04...0.60,
                        step: 0.01
                    )
                    Text(model.settings.threshold, format: .number.precision(.fractionLength(2)))
                        .monospacedDigit()
                        .frame(width: 42, alignment: .trailing)
                }

                HStack {
                    Text("Tap grouping window")
                    Slider(
                        value: Binding(
                            get: { model.settings.maxTapGap },
                            set: { model.setTapGap($0) }
                        ),
                        in: 0.20...0.80,
                        step: 0.02
                    )
                    Text("\(Int(model.settings.maxTapGap * 1000)) ms")
                        .monospacedDigit()
                        .frame(width: 64, alignment: .trailing)
                }

                Picker(
                    "Trigger after",
                    selection: Binding(
                        get: { model.settings.triggerTapCount },
                        set: { model.setTriggerTapCount($0) }
                    )
                ) {
                    Text("1 tap").tag(1)
                    Text("2 taps").tag(2)
                    Text("3 taps").tag(3)
                }
                .pickerStyle(.segmented)
            }

            Section("Actions") {
                actionPicker("Left side", side: .left)
                actionPicker("Right side", side: .right)
                actionPicker("Unclassified tap", side: .unknown)

                TextField(
                    "Apple Shortcut name",
                    text: Binding(
                        get: { model.settings.shortcutName },
                        set: { model.setShortcutName($0) }
                    )
                )
                .textFieldStyle(.roundedBorder)
            }

            Section("Side calibration") {
                Text(model.calibrationText)
                    .font(.callout)
                    .foregroundStyle(.secondary)

                HStack {
                    Button("Learn left") { model.beginCalibration(for: .left) }
                    Button("Learn right") { model.beginCalibration(for: .right) }
                    Button("Clear calibration", role: .destructive) { model.clearCalibration() }
                }

                Label(
                    model.isCalibrated ? "Both sides calibrated" : "Calibration incomplete",
                    systemImage: model.isCalibrated ? "checkmark.circle.fill" : "exclamationmark.circle"
                )
            }

            Section("Startup") {
                Toggle(
                    "Start listening when KnockDeck launches",
                    isOn: Binding(
                        get: { model.settings.launchListening },
                        set: { model.setLaunchListening($0) }
                    )
                )

                Text("All motion classification and actions run locally. KnockDeck does not record microphone audio and has no analytics or network runtime dependency.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Section("Compatibility") {
                Text("Requires an Apple Silicon MacBook exposing AppleSPUHIDDevice. The sensor interface is undocumented by Apple and may vary by model or macOS release; hardware validation is required before a production release.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .formStyle(.grouped)
    }

    @ViewBuilder
    private func actionPicker(_ title: String, side: TapSide) -> some View {
        Picker(
            title,
            selection: Binding(
                get: { action(for: side) },
                set: { model.setAction($0, for: side) }
            )
        ) {
            ForEach(KnockAction.allCases) { action in
                Text(action.title).tag(action)
            }
        }
    }

    private func action(for side: TapSide) -> KnockAction {
        switch side {
        case .left: return model.settings.leftAction
        case .right: return model.settings.rightAction
        case .unknown: return model.settings.unknownAction
        }
    }
}
