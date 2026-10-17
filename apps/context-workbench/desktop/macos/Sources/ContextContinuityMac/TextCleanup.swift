import Foundation

enum TextCleanup {
    static func clean(_ raw: String, dictionary: [String: String] = [:]) -> String {
        var text = raw
            .replacingOccurrences(of: #"\b(um+|uh+|you know)\b[,]?\s*"#, with: "", options: [.regularExpression, .caseInsensitive])
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)

        for (heard, wanted) in dictionary {
            text = text.replacingOccurrences(of: heard, with: wanted, options: [.caseInsensitive])
        }

        if let first = text.first {
            text.replaceSubrange(text.startIndex...text.startIndex, with: String(first).uppercased())
        }
        if !text.isEmpty && !".!?".contains(text.last!) { text.append(".") }
        return text
    }
}
