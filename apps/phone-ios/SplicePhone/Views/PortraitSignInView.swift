import SwiftUI

struct PortraitSignInView: View {
    @ObservedObject var viewModel: RaceDayViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Sign in with your Splice Sail account to tally for today's race and link your recording.")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            if !viewModel.isConfigured {
                Text("Edit SplicePhone/Config/SpliceSecrets.plist (not the .example file). Restore SUPABASE_URL, SUPABASE_ANON_KEY, and SPLICE_API_BASE_URL if it was overwritten.")
                    .font(.caption)
                    .foregroundStyle(.orange)
            }

            TextField("Email", text: $viewModel.signInEmail)
                .textContentType(.username)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()

            SecureField("Password", text: $viewModel.signInPassword)
                .textContentType(.password)

            if let error = viewModel.errorMessage {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
            }

            Button {
                Task { await viewModel.signIn() }
            } label: {
                if viewModel.isLoading {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                } else {
                    Text("Sign in")
                        .frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(viewModel.isLoading || !viewModel.isConfigured)
        }
        .padding(.vertical, 8)
    }
}
