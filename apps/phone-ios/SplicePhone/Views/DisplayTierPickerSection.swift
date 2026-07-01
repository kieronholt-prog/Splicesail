import SwiftUI

/// Tap-to-select tier list with immediate checkmark feedback (no navigation picker).
struct DisplayTierPickerSection: View {
    @ObservedObject var displaySettingsViewModel: DisplaySettingsViewModel
    let footer: String

    var body: some View {
        Section {
            LabeledContent("Selected") {
                Text(displaySettingsViewModel.settings.displayTier.label)
                    .foregroundStyle(.secondary)
            }

            ForEach(DisplayTier.allCases) { tier in
                Button {
                    var updated = displaySettingsViewModel.settings
                    updated.displayTier = tier
                    displaySettingsViewModel.settings = updated
                } label: {
                    HStack(alignment: .top, spacing: 12) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(tier.label)
                                .font(.body.weight(.semibold))
                            Text(tier.detail)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer(minLength: 8)
                        if displaySettingsViewModel.settings.displayTier == tier {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.title3)
                                .foregroundStyle(.yellow)
                        } else {
                            Image(systemName: "circle")
                                .font(.title3)
                                .foregroundStyle(.tertiary)
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        } header: {
            Text("Display tier")
        } footer: {
            Text(footer)
        }
    }
}
