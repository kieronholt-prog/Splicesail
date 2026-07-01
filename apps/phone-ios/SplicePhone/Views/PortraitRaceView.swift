import SwiftUI

struct PortraitRaceView: View {
    @ObservedObject var viewModel: RaceDayViewModel
    @ObservedObject var sessionRecording: SessionRecordingService

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isSignedIn {
                    signedInContent
                } else {
                    PortraitSignInView(viewModel: viewModel)
                }
            }
            .navigationTitle("Race")
            .toolbar {
                if viewModel.isSignedIn {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Refresh") {
                            Task { await viewModel.refresh() }
                        }
                        .disabled(viewModel.isLoading)
                    }
                    ToolbarItem(placement: .topBarLeading) {
                        Button("Sign out") {
                            Task { await viewModel.signOut() }
                        }
                    }
                }
            }
            .refreshable {
                await viewModel.refresh()
            }
        }
    }

    @ViewBuilder
    private var signedInContent: some View {
        List {
            if let race = viewModel.nextRace {
                if race.boats.contains(where: \.fleetStartPostponed) {
                    Section {
                        StartPostponedBanner(compact: true)
                            .frame(maxWidth: .infinity)
                    }
                }

                Section {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(race.raceName)
                            .font(.headline)
                        Text("\(race.clubName) · \(race.seriesName)")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        if let sync = viewModel.clubSyncStatus {
                            Text(sync)
                                .font(.caption)
                                .foregroundStyle(sync.contains("postponed") ? .orange : .blue)
                        }

                        if linkedBoatPostponed {
                            StartPostponedBanner(compact: true)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 8)
                        }
                    }
                } header: {
                    Text("Today's race")
                }

                Section {
                    ForEach(race.boats) { boat in
                        boatRow(boat, race: race)
                    }
                }
            } else if !viewModel.isLoading {
                ContentUnavailableView(
                    "No race today",
                    systemImage: "sailboat",
                    description: Text("When you have a series entry and a race scheduled for today, it will appear here.")
                )
            }

            if let error = viewModel.errorMessage {
                Section {
                    Text(error)
                        .foregroundStyle(.red)
                        .font(.caption)
                }
            }

            if viewModel.isSignedIn {
                Section {
                    Text(viewModel.apiDiagnostic)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                } header: {
                    Text("API status")
                } footer: {
                    Text("Updates when you tap Refresh. API base: \(SpliceConfig.apiBaseURL?.absoluteString ?? "not set")")
                        .font(.caption2)
                }
            }
        }
        .overlay {
            if viewModel.isLoading {
                ProgressView()
            }
        }
    }

    private var linkedBoatPostponed: Bool {
        guard let race = viewModel.nextRace,
              let boatId = sessionRecording.activeSession?.boatId,
              let boat = race.boats.first(where: { $0.boatId == boatId }),
              viewModel.isSessionLinked(to: boat) else {
            return false
        }
        return boat.fleetStartPostponed
    }

    @ViewBuilder
    private func boatRow(_ boat: TallyBoatRow, race: NextRacePayload) -> some View {
        let clubTimeZone = race.clubTimeZone
        let fleetStart = ClubTimeFormat.fleetStartHm(
            scheduledAt: race.scheduledAt,
            offsetMinutes: boat.fleetOffsetMinutes,
            timeZoneId: clubTimeZone
        ) ?? boat.fleetStartDisplay

        let fleetStartLabel = boat.fleetStartSource == "start_signal_at"
            ? "Fleet start \(fleetStart) (RO signal)"
            : "Fleet start \(fleetStart)"

        VStack(alignment: .leading, spacing: 8) {
            Text(boat.displayName)
                .font(.headline)
            Text(fleetStartLabel)
                .font(.caption)
                .foregroundStyle(.secondary)

            if boat.fleetStartPostponed {
                StartPostponedBanner(compact: true)
                    .padding(.top, 4)
            }

            if viewModel.isSessionLinked(to: boat) {
                Text("Session linked — track upload when your watch ends the activity")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if let afloat = boat.tallyAfloatAt {
                Text("Afloat recorded")
                    .font(.caption)
                    .foregroundStyle(.green)
                if let display = ClubTimeFormat.hm(iso: afloat, timeZoneId: clubTimeZone) {
                    Text(display)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }

            if let ashore = boat.tallyAshoreAt {
                Text("Ashore · \(boat.outcome?.uppercased() ?? "—")")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if let display = ClubTimeFormat.hm(iso: ashore, timeZoneId: clubTimeZone) {
                    Text(display)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }

            HStack {
                if boat.canTallyAfloat {
                    Button("Tally afloat") {
                        Task { await viewModel.tallyAfloat(boat: boat) }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.orange)
                }

                if boat.canUndoTallyAfloat {
                    Button("Undo tally afloat") {
                        Task { await viewModel.undoTallyAfloat(boat: boat) }
                    }
                    .buttonStyle(.bordered)
                }

                if boat.canTallyAshore {
                    Menu("Tally ashore") {
                        ForEach(sailorOutcomes, id: \.self) { outcome in
                            Button(outcomeLabel(outcome)) {
                                Task { await viewModel.tallyAshore(boat: boat, outcome: outcome) }
                            }
                        }
                    }
                    .buttonStyle(.bordered)
                }
            }
            .disabled(viewModel.isLoading)
        }
        .padding(.vertical, 4)
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

#Preview {
    let auth = MockSpliceAuthService()
    let recording = SessionRecordingService()
    let garmin = MockGarminCIQService()
    let timer = RaceTimerViewModel(garminService: garmin)
    let vm = RaceDayViewModel(
        auth: auth,
        garmin: garmin,
        sessionRecording: recording,
        raceTimerViewModel: timer
    )
    return PortraitRaceView(viewModel: vm, sessionRecording: recording)
}
