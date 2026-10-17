// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "ContextContinuityMac",
    platforms: [.macOS(.v14)],
    products: [.executable(name: "ContextContinuityMac", targets: ["ContextContinuityMac"])],
    targets: [
        .executableTarget(
            name: "ContextContinuityMac",
            path: "Sources/ContextContinuityMac"
        )
    ]
)
