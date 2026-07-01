import SwiftUI

struct PortraitFleetCompareView: View {
    let raceId: String
    let raceEntryId: String?
    let auth: SpliceAuthConnectable

    @StateObject private var viewModel: FleetCompareViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var showErrorAlert = false
    @State private var errorAlertText = ""

    init(raceId: String, raceEntryId: String?, auth: SpliceAuthConnectable) {
        self.raceId = raceId
        self.raceEntryId = raceEntryId
        self.auth = auth
        _viewModel = StateObject(wrappedValue: FleetCompareViewModel(auth: auth))
    }

    var body: some View {
        ZStack {
            Form {
                if viewModel.peers.isEmpty && viewModel.mySubmissionId == nil && !viewModel.isLoading {
                    Text("No collated fleet peers with sharing enabled yet.")
                        .foregroundStyle(.secondary)
                } else {
                    Picker("Boat A", selection: $viewModel.leftSubmissionId) {
                        if let mine = viewModel.mySubmissionId {
                            Text("You").tag(mine)
                        }
                        ForEach(viewModel.peers) { peer in
                            Text("#\(peer.sailNumber) · \(peer.finishDisplay)").tag(peer.submissionId)
                        }
                    }
                    Picker("Boat B", selection: $viewModel.rightSubmissionId) {
                        if let mine = viewModel.mySubmissionId {
                            Text("You").tag(mine)
                        }
                        ForEach(viewModel.peers) { peer in
                            Text("#\(peer.sailNumber) · \(peer.finishDisplay)").tag(peer.submissionId)
                        }
                    }
                    Button("Compare") {
                        Task { await viewModel.runCompare() }
                    }
                    .disabled(viewModel.isLoading)
                }

                if let compare = viewModel.compareResult {
                    Section("Overall") {
                        ForEach(compare.overall, id: \.metric) { row in
                            HStack {
                                Text(row.metric)
                                Spacer()
                                Text(row.left).monospacedDigit()
                                Text(row.right).monospacedDigit()
                            }
                            .font(.caption)
                        }
                    }
                    Section("By leg") {
                        ForEach(compare.legs) { leg in
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Leg \(leg.legNo) · \(leg.route)")
                                    .font(.subheadline)
                                HStack {
                                    Text(leg.leftDuration).monospacedDigit()
                                    Text("vs").foregroundStyle(.secondary)
                                    Text(leg.rightDuration).monospacedDigit()
                                    Spacer()
                                    Text(leg.deltaLabel)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }
            }

            if viewModel.isLoading, viewModel.peers.isEmpty, viewModel.mySubmissionId == nil {
                ProgressView("Loading fleet…")
            }
        }
        .navigationTitle("Fleet compare")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Done") { dismiss() }
            }
        }
        .task(id: raceId) {
            await viewModel.load(raceId: raceId, raceEntryId: raceEntryId)
        }
        .onChange(of: viewModel.errorMessage) { _, message in
            guard let message else { return }
            errorAlertText = message
            showErrorAlert = true
        }
        .alert("Compare", isPresented: $showErrorAlert) {
            Button("OK", role: .cancel) {
                viewModel.errorMessage = nil
            }
        } message: {
            Text(errorAlertText)
        }
    }
}
