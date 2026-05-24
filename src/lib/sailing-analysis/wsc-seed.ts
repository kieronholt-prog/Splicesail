/** WSC default marks and courses — seed data for club sailing-area import. */
export const WSC_SEED_MARKS: {
  name: string;
  lat: number;
  lon: number;
  mark_kind: "fixed" | "laid";
  description?: string;
}[] = [
  { name: "START/FINISH", lat: 50.85151, lon: -1.30851, mark_kind: "fixed", description: "Committee line" },
  { name: "BUOY 11", lat: 50.84878, lon: -1.30796, mark_kind: "fixed" },
  { name: "PILE 1", lat: 50.83904, lon: -1.3106, mark_kind: "fixed" },
  { name: "PILE 2", lat: 50.83991, lon: -1.3128, mark_kind: "fixed" },
  { name: "PILE 3", lat: 50.84081, lon: -1.31075, mark_kind: "fixed" },
  { name: "PILE 4", lat: 50.84155, lon: -1.31376, mark_kind: "fixed" },
  { name: "PILE 5", lat: 50.84231, lon: -1.31192, mark_kind: "fixed" },
  { name: "PILE 6", lat: 50.84378, lon: -1.31383, mark_kind: "fixed" },
  { name: "PILE 7", lat: 50.84333, lon: -1.31151, mark_kind: "fixed" },
  { name: "PILE 8", lat: 50.84544, lon: -1.31176, mark_kind: "fixed" },
  { name: "PILE 9", lat: 50.84635, lon: -1.30927, mark_kind: "fixed" },
  { name: "PILE 10", lat: 50.84831, lon: -1.30974, mark_kind: "fixed" },
  { name: "WARSASH SC", lat: 50.8435, lon: -1.3207, mark_kind: "fixed" },
  { name: "HAMBLE PT", lat: 50.8358, lon: -1.311, mark_kind: "fixed" },
  { name: "BALD HEAD", lat: 50.83, lon: -1.3012, mark_kind: "fixed" },
  { name: "WILLIAM", lat: 50.8277, lon: -1.2932, mark_kind: "fixed" },
  { name: "CORONATION", lat: 50.8258, lon: -1.2937, mark_kind: "fixed" },
  { name: "CHIEFTAIN TR", lat: 50.8242, lon: -1.2818, mark_kind: "fixed" },
  { name: "FUMESY", lat: 50.8202, lon: -1.291, mark_kind: "fixed" },
  { name: "LAID MK A", lat: 50.83733, lon: -1.31583, mark_kind: "laid", description: "Laid mark A" },
  { name: "LAID MK B", lat: 50.83494, lon: -1.30201, mark_kind: "laid", description: "Laid mark B" },
  { name: "LAID MK C", lat: 50.84948, lon: -1.31796, mark_kind: "laid", description: "Laid mark C" },
  { name: "LAID MK D", lat: 50.82394, lon: -1.29986, mark_kind: "laid", description: "Laid mark D" },
];

export const WSC_SEED_COURSES: {
  course_letter: string;
  display_name: string;
  course_type: "SC" | "MC" | "LC" | "custom";
  mark_sequence: [string, "P" | "S"][];
  marks_preamble?: [string, "P" | "S"][];
}[] = [
  { course_letter: "A", display_name: "A — SC", course_type: "SC", mark_sequence: [["BUOY 11", "S"], ["PILE 6", "S"], ["PILE 10", "S"]] },
  { course_letter: "B", display_name: "B — SC", course_type: "SC", mark_sequence: [["PILE 2", "P"], ["PILE 3", "P"], ["PILE 10", "P"]] },
  { course_letter: "C", display_name: "C — SC", course_type: "SC", mark_sequence: [["BUOY 11", "S"], ["PILE 1", "S"], ["PILE 2", "S"]] },
  { course_letter: "D", display_name: "D — SC (HW)", course_type: "SC", mark_sequence: [["PILE 2", "S"], ["WARSASH SC", "S"], ["PILE 10", "S"]] },
  { course_letter: "E", display_name: "E — SC (HW)", course_type: "SC", mark_sequence: [["PILE 10", "P"], ["WARSASH SC", "P"], ["PILE 2", "P"]] },
  { course_letter: "F", display_name: "F — SC", course_type: "SC", mark_sequence: [["PILE 2", "S"], ["LAID MK A", "P"], ["HAMBLE PT", "P"], ["PILE 5", "P"]] },
  { course_letter: "G", display_name: "G — SC", course_type: "SC", mark_sequence: [["PILE 5", "S"], ["HAMBLE PT", "S"], ["LAID MK A", "S"], ["PILE 2", "P"]] },
  { course_letter: "H", display_name: "H — SC (HW)", course_type: "SC", mark_sequence: [["PILE 10", "P"], ["WARSASH SC", "P"], ["HAMBLE PT", "P"]] },
  { course_letter: "I", display_name: "I — SC (HW)", course_type: "SC", mark_sequence: [["HAMBLE PT", "S"], ["WARSASH SC", "S"], ["PILE 10", "S"]] },
  { course_letter: "J", display_name: "J — SC", course_type: "SC", mark_sequence: [["PILE 3", "S"], ["BALD HEAD", "S"], ["HAMBLE PT", "S"]] },
  { course_letter: "K", display_name: "K — SC", course_type: "SC", mark_sequence: [["HAMBLE PT", "P"], ["BALD HEAD", "P"], ["PILE 3", "P"]] },
  {
    course_letter: "M",
    display_name: "M — SC (avoid LW)",
    course_type: "SC",
    marks_preamble: [["PILE 3", "P"]],
    mark_sequence: [["LAID MK B", "S"], ["HAMBLE PT", "S"], ["LAID MK B", "S"], ["HAMBLE PT", "S"], ["PILE 2", "S"]],
  },
  { course_letter: "N", display_name: "N — SC", course_type: "SC", mark_sequence: [["PILE 5", "S"], ["HAMBLE PT", "S"], ["WARSASH SC", "S"], ["PILE 2", "P"]] },
  { course_letter: "P", display_name: "P — SC", course_type: "SC", mark_sequence: [["PILE 2", "S"], ["WARSASH SC", "P"], ["HAMBLE PT", "P"], ["PILE 5", "P"]] },
  { course_letter: "Q", display_name: "Q — SC (HW)", course_type: "SC", marks_preamble: [["PILE 2", "S"]], mark_sequence: [["LAID MK C", "P"], ["WARSASH SC", "P"], ["PILE 2", "P"]] },
  { course_letter: "R", display_name: "R — MC (HW)", course_type: "MC", mark_sequence: [["PILE 2", "S"], ["WARSASH SC", "S"], ["PILE 10", "S"]] },
  { course_letter: "S", display_name: "S — MC", course_type: "MC", marks_preamble: [["HAMBLE PT", "P"]], mark_sequence: [["WILLIAM", "S"], ["LAID MK D", "S"], ["HAMBLE PT", "S"]] },
  { course_letter: "T", display_name: "T — MC", course_type: "MC", marks_preamble: [["HAMBLE PT", "P"]], mark_sequence: [["BALD HEAD", "P"], ["CORONATION", "P"], ["WILLIAM", "P"]] },
  { course_letter: "U", display_name: "U — MC", course_type: "MC", marks_preamble: [["HAMBLE PT", "P"]], mark_sequence: [["WILLIAM", "S"], ["CORONATION", "S"], ["HAMBLE PT", "S"]] },
  { course_letter: "V", display_name: "V — LC", course_type: "LC", marks_preamble: [["HAMBLE PT", "P"]], mark_sequence: [["CHIEFTAIN TR", "S"], ["FUMESY", "S"]] },
  { course_letter: "W", display_name: "W — LC", course_type: "LC", marks_preamble: [["HAMBLE PT", "P"]], mark_sequence: [["WILLIAM", "S"], ["CHIEFTAIN TR", "S"], ["FUMESY", "S"]] },
  { course_letter: "X", display_name: "X — LC", course_type: "LC", marks_preamble: [["HAMBLE PT", "P"]], mark_sequence: [["FUMESY", "P"], ["CHIEFTAIN TR", "P"], ["WILLIAM", "P"]] },
  {
    course_letter: "Y",
    display_name: "Y — LC",
    course_type: "LC",
    marks_preamble: [["HAMBLE PT", "P"]],
    mark_sequence: [["WILLIAM", "S"], ["CORONATION", "P"], ["CHIEFTAIN TR", "S"], ["FUMESY", "S"], ["BALD HEAD", "S"]],
  },
  { course_letter: "CUSTOM", display_name: "Custom — build your course", course_type: "custom", mark_sequence: [] },
];
