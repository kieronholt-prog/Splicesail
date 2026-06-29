# Sailing Performance App — Cursor Rules
# Swift (iOS) + Kotlin (Android) + Garmin Connect IQ (Monkey C)
# Last updated: 2026

# ─────────────────────────────────────────────
# PRIME DIRECTIVE
# ─────────────────────────────────────────────
# When unsure about implementation approach, STOP AND ASK.
# Never silently change architecture to make something easier.
# If a requirement conflicts with these rules, flag it explicitly.
# Never guess at sailing domain behaviour — ask if uncertain.


# ─────────────────────────────────────────────
# PROJECT OVERVIEW
# ─────────────────────────────────────────────
# This is a sailing race performance platform with three components:
#
# 1. GARMIN CONNECT IQ WATCH APP (Monkey C)
#    - Records GPS, Compass Heading, Heel, Trim from BLE sensors
#    - Displays raw sensor values only during racing (no computed metrics)
#    - Manages race start countdown timer
#    - Triggers start timer on paired phone via Communications.transmit()
#    - Saves activity as SPORT_SAILING FIT file (syncs to Garmin Connect)
#    - Custom fields (Heading, Heel, Trim, Turn rate) embedded in same FIT file
#    - Operates in two modes:
#        Mode 1: Phone aboard — streams position data mid-session
#        Mode 2: Watch only — stores session, uploads post-race via phone
#
# 2. iOS COMPANION APP (Swift / SwiftUI) + ANDROID (Kotlin / Compose)
#    - Receives start timer trigger from watch via Garmin CIQ Mobile SDK
#    - Mode 1: relays position pings from watch to web server (live tracking)
#    - Mode 2: receives full session data from watch post-race, uploads to server
#    - Connects to BLE Compass directly (parallel to watch in Mode 1)
#    - Subset of web app functionality for on-the-water use
#    - Outbound data only during racing — never receives tactical input
#
# 3. Splice WEB APPLICATION (existing)
#    - User Setup, Login Boat registration, CLUB creation and Race Management, Electronic Tally, Race Results
#    - Live tracking view for shore (Race Officer, spectators)
#    - Post-race analysis: VMG, laylines, leg performance, polar building
#    - Session management and history
#    - Race course and mark position management


# ─────────────────────────────────────────────
# COMPASS BOX BLE CONVENTION (firmware source of truth)
# ─────────────────────────────────────────────
# Live payload: 8 bytes, little-endian — see common/include/compass_protocol.h
# Service UUID: cb5e0001-9a1e-4c7a-b8f2-1a2b3c4d5e6f
# Notify UUID:  cb5e0002-9a1e-4c7a-b8f2-1a2b3c4d5e6f
# Heel sign in BLE/firmware: positive = PORT (P), negative = starboard (S)
# Display layer may show P/S labels; internal storage follows firmware sign.


# ─────────────────────────────────────────────
# ARCHITECTURE — UNIVERSAL RULES (Swift + Kotlin)
# ─────────────────────────────────────────────

## Layer Separation — NON-NEGOTIABLE
# Files with UI framework imports (SwiftUI / Jetpack Compose) must NEVER contain:
# - Network calls
# - Business logic
# - Data transformation
# - Sensor data processing
# - Direct SDK calls (Garmin CIQ, CoreLocation, BLE)
#
# Files in /Services, /Models, /Domain must NEVER import UI frameworks.
# Views receive data via dependency injection only — never reach for globals.

## File Structure
# /Models          — pure data structures, Codable/Serializable, no UI, no network
# /Services        — all external communication (network, BLE, Garmin CIQ, GPS)
# /Domain          — business logic, calculations, session management
# /Views           — UI only, consumes services via injected dependencies
# /ViewModels      — bridges Domain/Services to Views, owns @Published/@StateFlow state
# /Utils           — pure utility functions, no dependencies on other layers
# /Tests           — mirrors source structure, all services must be mockable

## Dependency Direction
# Views → ViewModels → Domain/Services → Models
# Never reverse this. Domain never imports Views. Services never import ViewModels.

## Every Service Must Have a Protocol
# This enables mocking for tests and Kotlin porting without UI entanglement.
#
# Swift example:
#   protocol SessionSyncing {
#       func upload(_ session: SailingSession) async throws
#   }
#   class SessionSyncService: SessionSyncing { ... }
#   class MockSessionSyncService: SessionSyncing { ... }
#
# Kotlin equivalent:
#   interface SessionSyncing {
#       suspend fun upload(session: SailingSession)
#   }


# ─────────────────────────────────────────────
# NAMING CONVENTIONS
# ─────────────────────────────────────────────

## Swift
# Models:      singular noun                    SailingSession, DataPoint, CourseGeometry
# Services:    noun + Service                   SessionSyncService, GarminCIQService, LocationService
# ViewModels:  noun + ViewModel                 SessionViewModel, LiveTrackingViewModel
# Views:       noun + View                      SessionView, LiveTrackingView, StartTimerView
# Protocols:   verb-ing or adjective            SessionSyncing, BLEConnectable, DataRecording
# Booleans:    is/has/should/can prefix         isUploading, hasGPSFix, shouldShowTimer, canTransmit
# Enums:       UpperCamelCase cases             ConnectionState.connected, UploadState.failed

## Kotlin
# Mirror Swift naming exactly for parallel components.
# Use data class for models, interface for protocols, object for singletons.
# StateFlow replaces @Published, suspend replaces async, Flow replaces AsyncStream.

## Monkey C (Connect IQ)
# Variables:   camelCase                        heelAngle, compassHeading, trimValue
# Functions:   camelCase                        onBLEData(), startRecording(), transmitToPhone()
# Constants:   UPPER_SNAKE_CASE                 MAX_DATA_POINTS, HEEL_FIELD_ID, TRIM_FIELD_ID

## Domain Terms — Always Use Full Words, Never Abbreviate
# heel         NOT hl
# trim         NOT trm
# heading      NOT hdg or brg
# latitude     NOT lat (except in well-known structs like CLLocationCoordinate2D)
# longitude    NOT lon/lng (same exception)
# velocity     NOT vel
# starboard    NOT stbd (in code — display layer may abbreviate)
# waypoint     NOT wpt (in code)
# nauticalMiles NOT nm (too ambiguous)


# ─────────────────────────────────────────────
# DATA INTEGRITY — CRITICAL
# ─────────────────────────────────────────────

# Session data is race-critical. Loss is unacceptable. Corruption is unacceptable.

## Persistence First, Upload Second
# ALL session data must be persisted locally BEFORE any upload attempt.
# If upload fails, data must survive app termination and device restart.
# Use Core Data (iOS) / Room (Android) for session storage — not UserDefaults/SharedPrefs.
# Never hold a complete session only in memory.

## Immutability of Recorded Data
# DataPoints are immutable once recorded.
# Never mutate raw sensor values after recording.
# Derived values (VMG, leg splits) are computed separately and stored separately.
# Raw data is always the source of truth.

## Upload Queue
# Failed uploads go into a persistent retry queue.
# Retry on next app launch, next connectivity event, and next session end.
# Never silently drop a failed upload.
# Surface upload state to the user always.

## FIT File Integrity
# session.save() must complete before transmitting to phone.
# Never transmit partial session data.
# In Mode 2, confirm FIT file integrity before upload.


# ─────────────────────────────────────────────
# SAILING DOMAIN RULES
# ─────────────────────────────────────────────

## Units — Internal Representation
# Speed:       always knots                     Double (knots)
# Distance>=1Nautical Mile:    always nautical miles            Double (nauticalMiles)
# Distance>=50meters:    always meters            Double (meters)
# Distance<50meters:    always boat lengths          Double (boatlengths)
# Boat length:    Defined in User settings in Meters        Double (boatlengths)

# Heading:     always degrees true, 0–359.9     Double, never negative, never > 360
# Heel:        degrees (firmware: + = port)     Double
# Trim:        degrees (+ = bow up)             Double
# Turn rate:   degrees per second               Double
# Position:    decimal degrees                  Double (never DMS internally)
# Time:        UTC always                       Date / Instant, never local time
# Convert to display units at the VIEW layer only — never internally.

## Heading Validation
# Always normalise heading to 0–359.9 before storing.
# func normaliseHeading(_ raw: Double) -> Double {
#     return ((raw.truncatingRemainder(dividingBy: 360)) + 360)
#         .truncatingRemainder(dividingBy: 360)
# }

## Race Timer
# Timer counts DOWN to zero (pre-start sequence).
# After gun (zero), timer counts UP (elapsed race time).
# Negative values = seconds before start.
# Positive values = seconds after start.
# Start timestamp stored as UTC Date, timer derived from it — never store countdown state.

## Leg Numbering
# Legs are 1-indexed. Leg 1 = first leg after start.
# Mark roundings define leg boundaries.
# Store leg start/end timestamps and positions.

## Rules Compliance in Code
# The app must NEVER display computed tactical metrics on the watch during a race.
# Computed metrics (VMG, laylines, polars) are POST-RACE ONLY.
# The watch displays: heading, heel, trim, speed, time, countdown. Nothing else during racing.
# The phone app during racing: transmit-only. No inbound tactical data.
# Document these constraints with comments wherever relevant in the codebase.


# ─────────────────────────────────────────────
# GARMIN CONNECT IQ (MONKEY C)
# ─────────────────────────────────────────────

## App Type
# Device App — NOT a Data Field.
# Data Fields cannot use Communications or Storage APIs fully.
# Sport type: Activity.SPORT_SAILING (value 32) — always use this, never GENERIC.

## FIT Recording
# Use ActivityRecording.createSession() with SPORT_SAILING.
# Custom fields registered via FitContributor:
#   HEADING_FIELD_ID = 0   (compass heading, degrees, Float)
#   HEEL_FIELD_ID    = 1   (heel angle, degrees, Float)
#   TRIM_FIELD_ID    = 2   (trim, degrees, Float)
#   TURN_FIELD_ID    = 3   (turn rate, deg/s, Float)
# Native fields (GPS, speed, distance, HR) recorded automatically.
# Call setData() only when values change — respect Smart Recording.
# session.save() on activity end — triggers auto-sync to Garmin Connect.

## Communications
# All watch-to-phone communication via Communications.transmit().
# All watch-to-server communication via Communications.makeWebRequest().
# makeWebRequest routes via Garmin Connect Mobile (BLE→phone→internet).
# For end-of-session bulk upload use Communications.SyncDelegate — more reliable.
# Never assume connectivity — always handle INVALID_HTTP_BODY_IN_NETWORK_RESPONSE.
# Queue data if transmit fails — retry on next connection event.

## Start Timer Trigger
# Transmitted as a Dictionary: { "event": "start_timer", "timestamp": unixSeconds }
# Phone must acknowledge receipt before watch confirms to user.
# If no acknowledgement within 3 seconds, surface error on watch — never silently fail.

## BLE Sensor Handling
# BLE Compass connects via BluetoothLowEnergy module.
# Parse heading, heel, trim from characteristic notifications.
# Handle disconnection gracefully — store last known value, surface warning on display.
# Never crash on nil sensor data — guard all sensor reads.

## Memory
# Monkey C has severe memory constraints — profile regularly.
# Do not store unbounded arrays of DataPoints in watch memory.
# In Mode 1 (phone aboard): stream data, do not accumulate on watch.
# In Mode 2 (watch only): accumulate in ObjectStore, not memory arrays.

## Display Rules During Racing
# Show only: heading, heel, trim, GPS speed, elapsed/countdown time.
# NO VMG, NO laylines, NO target angles, NO polar data.
# Comment every display element with: // RULES COMPLIANT: raw sensor data only


# ─────────────────────────────────────────────
# iOS SWIFT SPECIFIC
# ─────────────────────────────────────────────

## Concurrency
# All async work uses Swift async/await — never completion handlers or callbacks.
# All @Published properties that drive UI must be on @MainActor.
# Sensor data ingestion on a dedicated background actor.
# Never block the main thread, even briefly.
# Use Task {} to call async from sync context — never DispatchQueue.main.async for new code.

## Garmin CIQ Mobile SDK (iOS)
# All CIQ SDK calls wrapped in GarminCIQService — never called from views or ViewModels directly.
# GarminCIQService conforms to GarminCIQConnectable protocol.
# Handle ConnectIQSDK delegate callbacks and bridge to async/await internally.
# Publish ConnectionState: .disconnected / .connecting / .connected / .error(Error)
# Never assume the watch app is installed — handle IQAppStatus gracefully.

## CoreLocation
# All location access via LocationService — never CLLocationManager in views.
# Request always-on permission only if Mode 2 background upload requires it.
# During racing (Mode 1), foreground location is sufficient.
# Handle location denied/restricted states explicitly — surface to user.

## Core Data
# Use Core Data for session persistence.
# NSManagedObjectContext operations always on correct queue (viewContext on main).
# Background saves use newBackgroundContext().
# Never pass NSManagedObjects across threads — pass IDs and re-fetch.

## Security
# API tokens stored in Keychain — never UserDefaults.
# Never log GPS coordinates, session data, or personal data in production builds.
# Use #if DEBUG guards around all console logging of sensitive data.
# All server communication HTTPS only — no HTTP exceptions.
# No API keys hardcoded — use environment configuration or Keychain.

## No Force Unwrapping
# Never use ! anywhere in the codebase.
# Use guard let, if let, or ?? with sensible defaults.
# If a force unwrap seems necessary, it means the data model needs fixing.


# ─────────────────────────────────────────────
# KOTLIN ANDROID SPECIFIC
# ─────────────────────────────────────────────

## Concurrency
# All async work uses Kotlin coroutines and suspend functions.
# UI state exposed via StateFlow<T> — never LiveData for new code.
# Sensor/network work on Dispatchers.IO, UI updates on Dispatchers.Main.
# ViewModelScope for coroutines tied to ViewModel lifecycle.
# Never use GlobalScope.

## Garmin CIQ Mobile SDK (Android)
# Mirror GarminCIQService exactly from iOS counterpart.
# Implement same GarminCIQConnectable interface (translated to Kotlin interface).
# Bridge SDK callbacks to coroutines using suspendCoroutine or callbackFlow.

## Room Database
# Mirror Core Data schema exactly — same entity names, same field names.
# All DAO operations are suspend functions.
# Database instance via singleton — never instantiate multiple times.

## Jetpack Compose
# Mirror SwiftUI view structure — same screen names, same ViewModel bindings.
# collectAsState() for StateFlow — equivalent to @Published + .onReceive.
# No business logic in Composables — same rule as SwiftUI.

## Security
# API tokens in Android Keystore via EncryptedSharedPreferences.
# No API keys hardcoded.
# All network via Retrofit with HTTPS enforced.
# No logging of sensitive data in release builds (use BuildConfig.DEBUG guards).


# ─────────────────────────────────────────────
# ERROR HANDLING
# ─────────────────────────────────────────────

# Never use try? to silently swallow errors.
# Every error must either:
#   a) Surface to the user with a clear, actionable message, OR
#   b) Be logged and trigger a retry, OR
#   c) Both
#
# GPS failure:     degrade gracefully, show "No GPS Fix" on display, continue recording other sensors
# BLE failure:     show "Compass Disconnected", store last known values, retry connection
# Upload failure:  queue for retry, show upload status badge, never silently drop
# Watch disconnect: surface in phone app, continue phone-side recording if in Mode 1
#
# Error messages shown to users must follow these rules:
# - Say what happened in plain terms
# - Say what the user can do about it
# - Never show stack traces or technical codes to end users
# - Never say "Unknown error" — always be specific


# ─────────────────────────────────────────────
# TESTING
# ─────────────────────────────────────────────

# Every Service must have a Mock implementation for testing.
# Views must be previewable with injected mock services — no live network in previews.
# Never test against live GPS, BLE, or Garmin hardware in unit tests.
# Session upload logic must be testable against a local mock server.
# Test Mode 2 upload flow explicitly — it's the highest-risk data path.
# Test heading normalisation edge cases: 359.9→0.1, negative values, values >360.


# ─────────────────────────────────────────────
# CODE STYLE
# ─────────────────────────────────────────────

# Comments explain WHY, never WHAT. If you need to explain what code does, simplify the code.
# Exception: sailing domain rules compliance comments (see above) — always include these.
# Maximum function length: 40 lines. If longer, decompose.
# Maximum file length: 300 lines. If longer, split by responsibility.
# No magic numbers — every numeric constant gets a named constant with a comment explaining it.
# Guard/early-exit preferred over deeply nested if-lets.
# Prefer explicit types on public interfaces, inferred types acceptable internally.


# ─────────────────────────────────────────────
# KOTLIN PORT WORKFLOW
# ─────────────────────────────────────────────
# When porting Swift files to Kotlin, follow this mapping:
#
# Swift                    → Kotlin
# ──────────────────────────────────────────
# struct (Codable)         → data class (Serializable / Gson / Moshi)
# class (ObservableObject) → class (ViewModel with StateFlow)
# @Published               → StateFlow / MutableStateFlow
# protocol                 → interface
# async/await              → suspend / coroutines
# URLSession               → Retrofit + OkHttp
# Core Data                → Room
# Keychain                 → EncryptedSharedPreferences / Keystore
# SwiftUI View             → @Composable function
# @EnvironmentObject       → Hilt injection / CompositionLocalProvider
# enum with associated val → sealed class
# guard let x = x else    → val x = x ?: return
# CLLocationCoordinate2D   → android.location.Location or custom LatLng
# #if DEBUG                → if (BuildConfig.DEBUG)
#
# Port one file at a time. Confirm Swift version is stable before porting.
# Preserve all comments during porting, including rules compliance comments.
# Do not "improve" logic during porting — port first, refactor separately.


# ─────────────────────────────────────────────
# WHAT NOT TO DO — EXPLICIT PROHIBITIONS
# ─────────────────────────────────────────────
# Never put network calls in SwiftUI Views or Composables.
# Never put SwiftUI/Compose imports in Service or Model files.
# Never store auth tokens in UserDefaults or SharedPreferences.
# Never force unwrap optionals (!).
# Never use completion handlers in new Swift code — use async/await.
# Never use GlobalScope in Kotlin.
# Never display VMG, laylines, or computed tactics on watch during a race.
# Never receive tactical data on the boat during a race (transmit only).
# Never silently drop a failed session upload.
# Never store GPS coordinates or personal data in plain text logs.
# Never hardcode server URLs or API keys — use configuration.
# Never mutate raw recorded sensor data.
# Never assume BLE or watch connection — always check state first.
# Never block the main thread.
# Never guess at sailing rules compliance — ask if uncertain.
