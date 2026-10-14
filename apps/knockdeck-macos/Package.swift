// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "KnockDeck",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .executable(name: "KnockDeck", targets: ["KnockDeckApp"])
    ],
    targets: [
        .target(
            name: "KnockDeckCore",
            path: "Sources/KnockDeckCore"
        ),
        .executableTarget(
            name: "KnockDeckApp",
            dependencies: ["KnockDeckCore"],
            path: "Sources/KnockDeckApp",
            linkerSettings: [
                .linkedFramework("AppKit"),
                .linkedFramework("SwiftUI"),
                .linkedFramework("IOKit"),
                .linkedFramework("CoreAudio")
            ]
        ),
        .testTarget(
            name: "KnockDeckTests",
            dependencies: ["KnockDeckCore"],
            path: "Tests/KnockDeckTests"
        )
    ],
    swiftLanguageModes: [.v5]
)
