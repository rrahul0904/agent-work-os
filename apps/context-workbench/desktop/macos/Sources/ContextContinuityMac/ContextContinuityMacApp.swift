import SwiftUI

@main
struct ContextContinuityMacApp: App {
    @StateObject private var dictation = DictationEngine()
    @State private var cleaned = ""

    var body: some Scene {
        MenuBarExtra("Context Continuity", systemImage: dictation.isListening ? "waveform.circle.fill" : "waveform.circle") {
            VStack(alignment: .leading, spacing: 10) {
                Text(dictation.status).font(.caption)
                TextEditor(text: $dictation.transcript).frame(width: 360, height: 120)
                HStack {
                    Button(dictation.isListening ? "Stop" : "Dictate") {
                        if dictation.isListening {
                            dictation.stop()
                        } else {
                            Task {
                                if await dictation.requestAuthorization() {
                                    try? dictation.start()
                                }
                            }
                        }
                    }
                    Button("Clean & Paste") {
                        cleaned = TextCleanup.clean(dictation.transcript)
                        TextInjector.paste(cleaned)
                    }
                }
                Divider()
                Text("Agent handoff and research-memory services use the shared Agent Work OS contracts.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            .padding(12)
        }
    }
}
