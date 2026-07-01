import SwiftUI

struct PortraitAnalysisView: View {
    @ObservedObject var postRaceViewModel: PostRaceViewModel
    @ObservedObject var raceDayViewModel: RaceDayViewModel

    @State private var showErrorAlert = false
    @State private var errorAlertText = ""

    var body: some View {
        NavigationStack {
            ZStack {
                Group {
                    if !raceDayViewModel.isSignedIn {
                        PortraitSignInView(viewModel: raceDayViewModel)
                    } else if postRaceViewModel.submissions.isEmpty {
                        ContentUnavailableView {
                            Label("No tracks", systemImage: "chart.xyaxis.line")
                        } description: {
                            Text("Link a Garmin activity or upload a track on splicesail.com. Tallied phone sessions register automatically when the watch activity ends.")
                        }
                    } else {
                        List(postRaceViewModel.submissions) { track in
                            NavigationLink {
                                PortraitAnalysisDetailView(
                                    submissionId: track.id,
                                    auth: raceDayViewModel.spliceAuth
                                )
                            } label: {
                                TrackSubmissionRow(track: track)
                            }
                        }
                        .listStyle(.insetGrouped)
                    }
                }

                if raceDayViewModel.isSignedIn,
                   postRaceViewModel.isLoading,
                   postRaceViewModel.submissions.isEmpty {
                    ProgressView("Loading tracks…")
                }
            }
            .navigationTitle("Analysis")
            .refreshable {
                await postRaceViewModel.refresh()
            }
            .onChange(of: postRaceViewModel.errorMessage) { _, message in
                guard let message else { return }
                errorAlertText = message
                showErrorAlert = true
            }
            .alert("Analysis", isPresented: $showErrorAlert) {
                Button("OK", role: .cancel) {
                    postRaceViewModel.errorMessage = nil
                }
            } message: {
                Text(errorAlertText)
            }
        }
    }
}

private struct TrackSubmissionRow: View {
    let track: TrackSubmissionSummary

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline) {
                Text(track.activityName ?? track.raceName ?? "Track")
                    .font(.headline)
                Spacer()
                if let day = ClubTimeFormat.activityDayLabel(iso: track.sortTimestamp) {
                    Text(day)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            if let series = track.seriesName {
                Text(series)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            HStack {
                Text(track.sourceLabel)
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(.secondary)
                Text(track.statusLabel)
                    .font(.caption.weight(.medium))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 2)
                    .background(track.isReady ? Color.green.opacity(0.15) : Color.orange.opacity(0.15))
                    .clipShape(Capsule())
                Spacer()
                if let duration = track.durationSeconds {
                    Text(formatDuration(duration))
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.vertical, 4)
    }

    private func formatDuration(_ seconds: Double) -> String {
        let m = Int(seconds) / 60
        let s = Int(seconds) % 60
        return "\(m):\(String(format: "%02d", s))"
    }
}
