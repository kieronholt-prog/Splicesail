export type CrewPerson = {
  use_account_owner: boolean;
  contact_name: string | null;
  contact_phone: string | null;
};

export type CrewTemplate = {
  helm: CrewPerson;
  crew: CrewPerson[];
};

function checkboxTrue(formData: FormData, key: string): boolean {
  const v = formData.get(key);
  return v === "true" || v === "on";
}

function optionalText(formData: FormData, key: string): string | null {
  const s = String(formData.get(key) ?? "").trim();
  return s.length ? s : null;
}

export function crewTemplateFromForm(
  formData: FormData,
  handedness: string,
): CrewTemplate | null {
  const helm: CrewPerson = {
    use_account_owner: checkboxTrue(formData, "helm_use_owner"),
    contact_name: optionalText(formData, "helm_contact_name"),
    contact_phone: optionalText(formData, "helm_contact_phone"),
  };

  const crew: CrewPerson[] = [];

  if (handedness === "double" || handedness === "triple_plus") {
    crew.push({
      use_account_owner: checkboxTrue(formData, "crew_1_use_owner"),
      contact_name: optionalText(formData, "crew_1_contact_name"),
      contact_phone: optionalText(formData, "crew_1_contact_phone"),
    });
  }

  if (handedness === "triple_plus") {
    crew.push({
      use_account_owner: checkboxTrue(formData, "crew_2_use_owner"),
      contact_name: optionalText(formData, "crew_2_contact_name"),
      contact_phone: optionalText(formData, "crew_2_contact_phone"),
    });
  }

  if (handedness === "single") {
    return { helm, crew: [] };
  }

  if (handedness === "double") {
    if (crew.length !== 1) return null;
    return { helm, crew };
  }

  if (handedness === "triple_plus") {
    if (crew.length !== 2) return null;
    return { helm, crew };
  }

  return null;
}

/**
 * Human-readable helm / crew line for lists (owner name when "use account owner").
 */
/** Crew shown for racing: optional per-race override, else hull defaults from `boats`. */
export function resolveEffectiveCrewTemplate(
  crewTemplateOverride: unknown,
  boatCrewTemplate: unknown,
): CrewTemplate {
  const override = crewTemplateOverride as Partial<CrewTemplate> | null | undefined;
  const boat = boatCrewTemplate as CrewTemplate | null | undefined;

  const fromOverride =
    override &&
    override.helm &&
    typeof override.helm === "object" &&
    "use_account_owner" in override.helm
      ? ({
          helm: override.helm as CrewPerson,
          crew: Array.isArray(override.crew) ? (override.crew as CrewPerson[]) : [],
        } satisfies CrewTemplate)
      : null;

  if (fromOverride) return fromOverride;

  if (boat?.helm && typeof boat.helm === "object") {
    return {
      helm: boat.helm,
      crew: Array.isArray(boat.crew) ? boat.crew : [],
    };
  }

  return {
    helm: { use_account_owner: true, contact_name: null, contact_phone: null },
    crew: [],
  };
}

export function helmAndCrewDisplayLabels(
  crewTemplate: unknown,
  handedness: string,
  ownerDisplayName: string | null,
): { helm: string; crew: string } {
  const tpl = crewTemplate as CrewTemplate | null;
  if (!tpl || typeof tpl !== "object" || tpl.helm == null) {
    return { helm: "—", crew: "—" };
  }
  const owner = ownerDisplayName?.trim() || "Owner";
  const helmStr = tpl.helm.use_account_owner
    ? owner
    : (tpl.helm.contact_name ?? "").trim() || "—";
  if (handedness === "single") {
    return { helm: helmStr, crew: "—" };
  }
  const parts = (tpl.crew ?? []).map((p) =>
    p.use_account_owner ? owner : (p.contact_name ?? "").trim() || "—",
  );
  return { helm: helmStr, crew: parts.length ? parts.join(" · ") : "—" };
}
