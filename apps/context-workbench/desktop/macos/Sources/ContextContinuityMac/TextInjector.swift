import AppKit
import ApplicationServices

enum TextInjector {
    static func paste(_ text: String) {
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.setString(text, forType: .string)

        let source = CGEventSource(stateID: .hidSystemState)
        let keyV = CGKeyCode(9)
        let down = CGEvent(keyboardEventSource: source, virtualKey: keyV, keyDown: true)
        down?.flags = .maskCommand
        let up = CGEvent(keyboardEventSource: source, virtualKey: keyV, keyDown: false)
        up?.flags = .maskCommand
        down?.post(tap: .cghidEventTap)
        up?.post(tap: .cghidEventTap)
    }
}
