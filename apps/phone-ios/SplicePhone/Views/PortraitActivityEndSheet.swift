import SwiftUI

struct PortraitActivityEndSheet: View {
    let prompt: ActivityEndPrompt
    @ObservedObject var raceDayViewModel: RaceDayViewModel
    let onDismiss: () -> Void

    @State private var showDeclaration = false

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 20) {
                Text("Activity saved on your watch")
                    .font(.headline)

                if let raceName = prompt.raceName, let boat = prompt.boatLabel {
                    Text("\(raceName) · \(boat)")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                Text("Your session is stored on this phone. Upload and analysis will follow in a later update.")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Button("Save (Tally later)") {
                    onDismiss()
                }
                .buttonStyle(.borderedProminent)
                .tint(.secondary)

                Button("Save and Tally Ashore") {
                    showDeclaration = true
                }
                .buttonStyle(.borderedProminent)
                .disabled(!canTallyAshore)

                if !canTallyAshore {
                    Text("Tally afloat first to declare ashore.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()
            }
            .padding()
            .navigationTitle("End of activity")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { onDismiss() }
                }
            }
            .sheet(isPresented: $showDeclaration) {
                declarationSheet
            }
        }
        .presentationDetents([.medium, .large])
    }

    private var canTallyAshore: Bool {
        guard let boatId = prompt.boatId,
              let race = raceDayViewModel.nextRace else { return false }
        return race.boats.first(where: { $0.boatId == boatId })?.canTallyAshore == true
            || race.boats.first(where: { $0.boatId == boatId })?.tallyAfloatAt != nil
    }

    @ViewBuilder
    private var declarationSheet: some View {
        NavigationStack {
            List {
                ForEach(sailorOutcomes, id: \.self) { outcome in
                    Button(outcomeLabel(outcome)) {
                        Task {
                            await declareAshore(outcome: outcome)
                        }
                    }
                }
            }
            .navigationTitle("Declaration")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { showDeclaration = false }
                }
            }
        }
        .presentationDetents([.medium])
    }

    private func declareAshore(outcome: String) async {
        guard let boatId = prompt.boatId,
              let race = raceDayViewModel.nextRace,
              let boat = race.boats.first(where: { $0.boatId == boatId }) else {
            return
        }
        await raceDayViewModel.tallyAshore(boat: boat, outcome: outcome)
        showDeclaration = false
        onDismiss()
    }

    private var sailorOutcomes: [String] {
        ["finished", "retired", "dns", "dnc"]
    }

    private func outcomeLabel(_ code: String) -> String {
        switch code {
        case "finished": return "Finished"
        case "retired": return "Retired"
        case "dns": return "DNS"
        case "dnc": return "DNC"
        default: return code.uppercased()
        }
    }
}
