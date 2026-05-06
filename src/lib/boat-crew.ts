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
