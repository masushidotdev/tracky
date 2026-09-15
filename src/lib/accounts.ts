type AccountLabelInput = {
  _id?: string;
  alias?: string | null;
  institutionName?: string | null;
  ibanMasked?: string | null;
  name?: string | null;
};

function cleanLabel(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

export function accountLabel(account: AccountLabelInput | null | undefined, fallback = '-') {
  if (!account) {
    return fallback;
  }

  const institutionName = cleanLabel(account.institutionName);
  const alias = cleanLabel(account.alias);

  if (institutionName && alias) {
    return `${institutionName} (${alias})`;
  }

  return (
    institutionName ?? alias ?? cleanLabel(account.ibanMasked) ?? cleanLabel(account.name) ?? account._id ?? fallback
  );
}
