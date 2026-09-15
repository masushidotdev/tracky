type EnableBankingParty = {
  name?: string | null;
};

export type EnableBankingTransactionForMapping = {
  credit_debit_indicator?: 'CRDT' | 'DBIT';
  creditor?: EnableBankingParty | null;
  debtor?: EnableBankingParty | null;
  ultimate_creditor?: EnableBankingParty | null;
  ultimate_debtor?: EnableBankingParty | null;
  remittance_information?: Array<string>;
  entry_reference?: string;
  bank_transaction_code?: unknown;
};

function firstNonEmpty(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalized = value?.trim();
    if (normalized) return normalized;
  }
  return undefined;
}

function bankTransactionCode(value: unknown) {
  if (typeof value !== 'object' || value === null || !('code' in value)) return null;
  const code = (value as { code?: unknown }).code;
  return typeof code === 'string' ? code.trim().toUpperCase() : null;
}

function extractLabeledParty(transaction: EnableBankingTransactionForMapping) {
  const labels =
    transaction.credit_debit_indicator === 'DBIT'
      ? ['NOME', 'BENEF(?:ICIARIO)?', 'CREDITORE']
      : ['MITT(?:ENTE)?', 'DEBITORE', 'ORDINANTE'];
  const stopLabels =
    '(?:MANDATO|BENEF(?:ICIARIO)?|MITT(?:ENTE)?|CREDITORE|DEBITORE|ORDINANTE|COD(?:ICE)?(?:\\.\\s*DISP)?|IBAN|CAUSALE|RIF(?:ERIMENTO)?)';
  const pattern = new RegExp(
    `(?:^|\\s)(?:${labels.join('|')})\\.?\\s*:\\s*(.+?)(?=\\s+${stopLabels}\\.?\\s*:|$)`,
    'iu',
  );

  for (const line of transaction.remittance_information ?? []) {
    const match = line.match(pattern);
    const value = match?.[1]?.trim();
    if (value) return value;
  }
  return undefined;
}

function extractNarrativeParty(transaction: EnableBankingTransactionForMapping) {
  for (const line of transaction.remittance_information ?? []) {
    const patterns =
      transaction.credit_debit_indicator === 'DBIT'
        ? [
            /\bSDD\s+da\s+\S+\s+(.+?)\s+mandato\s+nr\.?\b/iu,
            /\bBONIFICO\b.*?\bA\s{2,}(.+?)\s+PER\s{2,}/iu,
            /\bCARTA\s+\S+.*?\bDI\s+[A-Z]{3}\s+[\d.,]+\s+(.+)$/iu,
          ]
        : [/\b(?:BONIFICO|EMOLUMENTI)\b.*?\bDA\s{2,}(.+?)\s+PER\s{2,}/iu];

    for (const pattern of patterns) {
      const value = line.match(pattern)?.[1]?.replace(/\s+/g, ' ').trim();
      if (value) return value;
    }
  }
  return undefined;
}

function extractTransferParty(transaction: EnableBankingTransactionForMapping) {
  if (bankTransactionCode(transaction.bank_transaction_code) !== 'TRANSFER') return undefined;
  const lines = (transaction.remittance_information ?? []).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return undefined;

  const candidate = lines.at(-1);
  if (!candidate || candidate.length > 120 || !/\p{L}/u.test(candidate)) return undefined;
  return candidate;
}

export function enableBankingTransactionDescription(transaction: EnableBankingTransactionForMapping) {
  const remittance = transaction.remittance_information?.map((line) => line.trim()).filter(Boolean).join(' / ');
  const expectedParty =
    transaction.credit_debit_indicator === 'DBIT'
      ? firstNonEmpty(transaction.creditor?.name, transaction.ultimate_creditor?.name)
      : firstNonEmpty(transaction.debtor?.name, transaction.ultimate_debtor?.name);

  return firstNonEmpty(
    expectedParty,
    remittance,
    transaction.credit_debit_indicator === 'DBIT' ? transaction.debtor?.name : transaction.creditor?.name,
    transaction.entry_reference,
  ) ?? (transaction.credit_debit_indicator === 'CRDT' ? 'Credit transaction' : 'Debit transaction');
}

export function enableBankingCounterpartyName(transaction: EnableBankingTransactionForMapping) {
  const structuredParty =
    transaction.credit_debit_indicator === 'DBIT'
      ? firstNonEmpty(transaction.creditor?.name, transaction.ultimate_creditor?.name)
      : firstNonEmpty(transaction.debtor?.name, transaction.ultimate_debtor?.name);

  return (
    structuredParty ??
    extractLabeledParty(transaction) ??
    extractNarrativeParty(transaction) ??
    extractTransferParty(transaction)
  );
}
