import SwiftUI

private struct FleetCompareSheetContext: Identifiable {
    let raceId: String
    let raceEntryId: String?
    var id: String { raceId }
}

struct PortraitAnalysisDetailView: View {
    let submissionId: String
    let auth: SpliceAuthConnectable

    @StateObject private var viewModel: AnalysisDetailViewModel
    @State private var fleetCompareContext: FleetCompareSheetContext?
    @State private var showErrorAlert = false
    @State private var errorAlertText = ""

    init(submissionId: String, auth: SpliceAuthConnectable) {
        self.submissionId = submissionId
        self.auth = auth
        _viewModel = StateObject(wrappedValue: AnalysisDetailViewModel(auth: auth))
    }

    var body: some View {
        ZStack {
            Group {
                if let detail = viewModel.detail {
                    analysisList(detail)
                } else if !viewModel.isLoading {
                    ContentUnavailableView("Analysis unavailable", systemImage: "exclamationmark.triangle")
                }
            }

            if viewModel.isLoading, viewModel.detail == nil {
                ProgressView("Loading analysis…")
            }
        }
        .navigationTitle(viewModel.detail?.summary.activityName ?? "Analysis")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: submissionId) {
            await viewModel.load(submissionId: submissionId)
        }
        .sheet(item: $fleetCompareContext) { context in
            NavigationStack {
                PortraitFleetCompareView(
                    raceId: context.raceId,
                    raceEntryId: context.raceEntryId,
                    auth: auth
                )
            }
        }
        .onChange(of: viewModel.errorMessage) { _, message in
            guard let message else { return }
            errorAlertText = message
            showErrorAlert = true
        }
        .alert("Analysis", isPresented: $showErrorAlert) {
            Button("OK", role: .cancel) {
                viewModel.errorMessage = nil
            }
        } message: {
            Text(errorAlertText)
        }
    }

    @ViewBuilder
    private func analysisList(_ detail: TrackSubmissionDetail) -> some View {
        List {
            Section("Summary") {
                LabeledContent("Status", value: detail.summary.statusLabel)
                if let wind = detail.windDirection {
                    LabeledContent("Wind FROM", value: "\(Int(wind.rounded()))°")
                }
                if let tacks = detail.tackCount {
                    LabeledContent("Tacks", value: "\(tacks)")
                }
                if let gybes = detail.gybeCount {
                    LabeledContent("Gybes", value: "\(gybes)")
                }
                if let duration = detail.durationSeconds {
                    LabeledContent("Elapsed", value: formatDuration(duration))
                }
            }

            if !detail.legs.isEmpty {
                Section("Legs") {
                    ForEach(detail.legs) { leg in
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Leg \(leg.legNo) · \(leg.legType)")
                                .font(.subheadline.weight(.medium))
                            Text("\(leg.from) → \(leg.to)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            if let dur = leg.durationSeconds {
                                Text(formatDuration(dur))
                                    .font(.caption.monospacedDigit())
                            }
                        }
                    }
                }
            }

            if detail.summary.isReady, let raceId = detail.summary.raceId {
                Section {
                    Button("Compare with fleet") {
                        fleetCompareContext = FleetCompareSheetContext(
                            raceId: raceId,
                            raceEntryId: detail.summary.raceEntryId
                        )
                    }
                }
            }

            if !detail.analysisUrl.isEmpty, let url = URL(string: detail.analysisUrl) {
                Section {
                    Link("Open full map on web", destination: url)
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    private func formatDuration(_ seconds: Double) -> String {
        let m = Int(seconds) / 60
        let s = Int(seconds) % 60
        return "\(m):\(String(format: "%02d", s))"
    }
}
