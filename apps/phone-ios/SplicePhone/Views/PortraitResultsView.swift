import SwiftUI

struct PortraitResultsView: View {
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
                    } else if postRaceViewModel.seriesGroups.isEmpty {
                        ContentUnavailableView {
                            Label("No results yet", systemImage: "trophy")
                        } description: {
                            Text("Finish a race and your series position and per-race results will appear here.")
                        }
                    } else {
                        List {
                            ForEach(postRaceViewModel.seriesGroups) { group in
                                DisclosureGroup {
                                    ForEach(group.races) { race in
                                        NavigationLink {
                                            if let trackId = race.trackSubmissionId {
                                                PortraitAnalysisDetailView(
                                                    submissionId: trackId,
                                                    auth: raceDayViewModel.spliceAuth
                                                )
                                            } else {
                                                Text("No track linked for this race yet.")
                                                    .foregroundStyle(.secondary)
                                            }
                                        } label: {
                                            SeriesRaceRow(race: race)
                                        }
                                    }
                                } label: {
                                    SeriesGroupHeader(group: group)
                                }
                            }
                        }
                        .listStyle(.insetGrouped)
                    }
                }

                if raceDayViewModel.isSignedIn,
                   postRaceViewModel.isLoading,
                   postRaceViewModel.seriesGroups.isEmpty {
                    ProgressView("Loading results…")
                }
            }
            .navigationTitle("Results")
            .refreshable {
                await postRaceViewModel.refresh()
            }
            .onChange(of: postRaceViewModel.errorMessage) { _, message in
                guard let message else { return }
                errorAlertText = message
                showErrorAlert = true
            }
            .alert("Results", isPresented: $showErrorAlert) {
                Button("OK", role: .cancel) {
                    postRaceViewModel.errorMessage = nil
                }
            } message: {
                Text(errorAlertText)
            }
        }
    }
}

private struct SeriesGroupHeader: View {
    let group: SeriesResultsGroup

    var body: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 4) {
                Text(group.seriesName)
                    .font(.headline)
                if let club = group.clubName {
                    Text(club)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Text("\(group.races.count) race\(group.races.count == 1 ? "" : "s")")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            if let position = group.overallPositionLabel {
                VStack(alignment: .trailing, spacing: 2) {
                    Text(position)
                        .font(.title3.monospacedDigit().weight(.semibold))
                    Text("overall")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.vertical, 4)
    }
}

private struct SeriesRaceRow: View {
    let race: SeriesRaceResult

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(race.raceName)
                .font(.subheadline.weight(.medium))
            HStack {
                if let day = ClubTimeFormat.activityDayLabel(iso: race.scheduledAt) {
                    Text(day)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                if let label = race.boatLabel {
                    Text("· \(label)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else {
                    Text("· #\(race.sailNumber)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            HStack {
                Text(race.finishDisplay)
                    .font(.body.monospacedDigit().weight(.semibold))
                Spacer()
                if let status = race.trackStatus {
                    Text(status.replacingOccurrences(of: "_", with: " ").capitalized)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.vertical, 2)
    }
}
