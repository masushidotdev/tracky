import * as React from 'react';

import type { AppLocale } from '@/lib/i18n';

export function TrackyMark({ className = 'mka-wordmark-mark' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <rect x="2" y="6" width="17" height="15" rx="3.5" fill="#E09F3E" />
      <rect x="6" y="3.5" width="18" height="15" rx="3.5" fill="#FDF8F0" stroke="#1C2541" strokeWidth="1.8" />
      <path
        d="M6.8 7.2L15 12.6L23.2 7.2"
        stroke="#C23B26"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const diagramCopy: Record<
  AppLocale,
  {
    ariaLabel: string;
    observedCash: string;
    assigned: string;
    activity: string;
    readyToAssign: string;
    env1: string;
    env2: string;
    env3: string;
    zeroLine: string;
    payday: string;
    statement: string;
    firstNeg: string;
    cycleBadge: string;
    cycleBadgeWidth: number;
  }
> = {
  en: {
    ariaLabel:
      "Diagram of Tracky's zero-based Plan buckets, Ready to Assign at zero, and dated cycle cash-flow projection showing the first negative date",
    observedCash: 'OBSERVED CASH',
    assigned: 'Assigned',
    activity: 'Activity',
    readyToAssign: 'Ready to Assign',
    env1: 'Bills',
    env2: 'Everyday',
    env3: 'Card pay',
    zeroLine: '€0 line',
    payday: 'Payday',
    statement: 'Statement',
    firstNeg: 'First negative date',
    cycleBadge: 'CYCLE CASH FLOW',
    cycleBadgeWidth: 122,
  },
  it: {
    ariaLabel:
      'Diagramma dei bucket del Piano zero-based di Tracky, Da assegnare a zero e proiezione datata del flusso di cassa con la prima data negativa',
    observedCash: 'LIQUIDITÀ OSSERVATA',
    assigned: 'Assegnato',
    activity: 'Attività',
    readyToAssign: 'Da assegnare',
    env1: 'Bollette',
    env2: 'Quotidiano',
    env3: 'Carta',
    zeroLine: 'Linea €0',
    payday: 'Stipendio',
    statement: 'Estratto',
    firstNeg: 'Prima data negativa',
    cycleBadge: 'FLUSSO DI CASSA',
    cycleBadgeWidth: 122,
  },
};

export function HeroLedgerDiagram({ locale }: { locale: AppLocale }) {
  const t = diagramCopy[locale];
  const font = 'Plus Jakarta Sans Variable, Jakarta Fallback, sans-serif';

  return (
    <svg viewBox="0 0 540 400" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label={t.ariaLabel}>
      <rect x="8" y="8" width="524" height="384" rx="14" fill="#FDF8F0" stroke="#1C2541" strokeWidth="2" />
      <g fill="#D7CBB6">
        <circle cx="36" cy="30" r="2" />
        <circle cx="64" cy="30" r="2" />
        <circle cx="92" cy="30" r="2" />
        <circle cx="448" cy="30" r="2" />
        <circle cx="476" cy="30" r="2" />
        <circle cx="504" cy="30" r="2" />
      </g>

      <rect x="42" y="54" width="214" height="146" rx="10" fill="#E8EFFC" />
      <rect x="288" y="54" width="216" height="146" rx="10" fill="#FBF1DB" />
      <rect x="46" y="232" width="454" height="130" rx="10" fill="#E4F1EA" />

      <rect x="34" y="46" width="214" height="146" rx="10" fill="#FFFFFF" stroke="#1C2541" strokeWidth="2" />
      <line x1="34" y1="80" x2="248" y2="80" stroke="#1C2541" strokeWidth="1.6" />
      <circle cx="52" cy="63" r="4.5" fill="#C23B26" />
      <circle cx="68" cy="63" r="4.5" fill="#E09F3E" />
      <text x="82" y="67" fill="#1C2541" fontFamily={font} fontSize="10" fontWeight="700">
        {t.observedCash}
      </text>

      <text x="48" y="104" fill="#1C2541" fontFamily={font} fontSize="10.5" fontWeight="600">
        {t.assigned}
      </text>
      <rect x="166" y="92" width="66" height="17" rx="8" fill="#E4F1EA" stroke="#2F6B51" strokeWidth="1.4" />
      <line x1="178" y1="100.5" x2="220" y2="100.5" stroke="#2F6B51" strokeWidth="2" strokeLinecap="round" />

      <text x="48" y="131" fill="#4A546E" fontFamily={font} fontSize="10.5" fontWeight="600">
        {t.activity}
      </text>
      <rect x="166" y="119" width="66" height="17" rx="8" fill="#FBF1DB" stroke="#1C2541" strokeWidth="1.4" />
      <line x1="178" y1="127.5" x2="210" y2="127.5" stroke="#1C2541" strokeWidth="2" strokeLinecap="round" />

      <text x="48" y="164" fill="#1C2541" fontFamily={font} fontSize="10.5" fontWeight="700">
        {t.readyToAssign}
      </text>
      <rect x="162" y="148" width="70" height="26" rx="13" fill="#2F6B51" />
      <text x="197" y="165" textAnchor="middle" fill="#FDF8F0" fontFamily={font} fontSize="11.5" fontWeight="700">
        €0 ✓
      </text>

      <g className="mka-anim-float">
        <circle cx="316" cy="76" r="13" fill="#E09F3E" stroke="#1C2541" strokeWidth="2" />
        <circle cx="392" cy="68" r="10.5" fill="#C23B26" stroke="#1C2541" strokeWidth="2" />
        <circle cx="464" cy="78" r="12" fill="#2B59C3" stroke="#1C2541" strokeWidth="2" />
      </g>

      <g>
        <rect x="280" y="106" width="68" height="84" rx="8" fill="#FFFFFF" stroke="#1C2541" strokeWidth="2" />
        <path d="M281 114L314 138L347 114" stroke="#1C2541" strokeWidth="1.8" strokeLinejoin="round" />
        <rect x="294" y="150" width="40" height="7" rx="3.5" fill="#E09F3E" />
        <text x="314" y="177" textAnchor="middle" fill="#4A546E" fontFamily={font} fontSize="9.5" fontWeight="700">
          {t.env1}
        </text>

        <rect x="358" y="98" width="68" height="92" rx="8" fill="#FFFFFF" stroke="#1C2541" strokeWidth="2" />
        <path d="M359 106L392 132L425 106" stroke="#C23B26" strokeWidth="1.8" strokeLinejoin="round" />
        <rect x="372" y="148" width="40" height="7" rx="3.5" fill="#2F6B51" />
        <text x="392" y="177" textAnchor="middle" fill="#4A546E" fontFamily={font} fontSize="9.5" fontWeight="700">
          {t.env2}
        </text>

        <rect x="436" y="110" width="66" height="80" rx="8" fill="#FFFFFF" stroke="#1C2541" strokeWidth="2" />
        <path d="M437 118L469 140L501 118" stroke="#2B59C3" strokeWidth="1.8" strokeLinejoin="round" />
        <rect x="449" y="152" width="40" height="7" rx="3.5" fill="#2B59C3" />
        <text x="469" y="177" textAnchor="middle" fill="#4A546E" fontFamily={font} fontSize="9.5" fontWeight="700">
          {t.env3}
        </text>
      </g>

      <rect x="38" y="222" width="464" height="132" rx="12" fill="#FFFFFF" stroke="#1C2541" strokeWidth="2" />
      <line x1="60" y1="262" x2="480" y2="262" stroke="#D7CBB6" strokeWidth="1.5" strokeDasharray="4 4" />
      <line x1="60" y1="296" x2="480" y2="296" stroke="#D7CBB6" strokeWidth="1.5" strokeDasharray="4 4" />
      <line x1="60" y1="324" x2="480" y2="324" stroke="#C23B26" strokeWidth="1.5" strokeDasharray="6 4" />
      <text x="480" y="319" textAnchor="end" fill="#C23B26" fontFamily={font} fontSize="9.5" fontWeight="700">
        {t.zeroLine}
      </text>

      <line x1="145" y1="236" x2="145" y2="342" stroke="#EFE6D5" strokeWidth="1.5" />
      <line x1="250" y1="236" x2="250" y2="342" stroke="#EFE6D5" strokeWidth="1.5" />
      <line x1="355" y1="236" x2="355" y2="342" stroke="#EFE6D5" strokeWidth="1.5" />

      <path
        d="M64 276 C104 276, 114 252, 154 254 C194 256, 212 288, 254 290 C294 292, 316 332, 356 330 C396 328, 418 260, 470 258"
        stroke="#2B59C3"
        strokeWidth="3.2"
        strokeLinecap="round"
        fill="none"
      />

      <circle cx="154" cy="254" r="6.5" fill="#2F6B51" stroke="#1C2541" strokeWidth="2" />
      <circle cx="254" cy="290" r="6.5" fill="#E09F3E" stroke="#1C2541" strokeWidth="2" />
      <circle cx="356" cy="330" r="7.5" fill="#C23B26" stroke="#1C2541" strokeWidth="2" />
      <circle cx="470" cy="258" r="6.5" fill="#2F6B51" stroke="#1C2541" strokeWidth="2" />

      <text x="154" y="242" textAnchor="middle" fill="#2F6B51" fontFamily={font} fontSize="9.5" fontWeight="700">
        {t.payday}
      </text>
      <text x="254" y="278" textAnchor="middle" fill="#1C2541" fontFamily={font} fontSize="9.5" fontWeight="700">
        {t.statement}
      </text>
      <text x="356" y="346" textAnchor="middle" fill="#C23B26" fontFamily={font} fontSize="9.5" fontWeight="700">
        {t.firstNeg}
      </text>

      <rect x="56" y="232" width={t.cycleBadgeWidth} height="22" rx="6" fill="#1C2541" />
      <text
        x={56 + t.cycleBadgeWidth / 2}
        y="247"
        textAnchor="middle"
        fill="#FDF8F0"
        fontFamily={font}
        fontSize="10"
        fontWeight="700"
      >
        {t.cycleBadge}
      </text>
    </svg>
  );
}

export type StepIconKind = 'import' | 'envelopes' | 'cashflow' | 'reports';

export function StepIcon({ kind }: { kind: StepIconKind }) {
  switch (kind) {
    case 'import':
      return (
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <rect x="4" y="6" width="24" height="20" rx="4" fill="#E4F1EA" stroke="#1C2541" strokeWidth="1.6" />
          <path
            d="M16 11V21M12 17L16 21L20 17"
            stroke="#2F6B51"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'envelopes':
      return (
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <rect x="4" y="8" width="24" height="18" rx="4" fill="#FBF1DB" stroke="#1C2541" strokeWidth="1.6" />
          <path d="M5 11L16 18.5L27 11" stroke="#C23B26" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      );
    case 'cashflow':
      return (
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <rect x="4" y="6" width="24" height="20" rx="4" fill="#E8EFFC" stroke="#1C2541" strokeWidth="1.6" />
          <path
            d="M8 21L13 15L18 18L24 12"
            stroke="#2B59C3"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'reports':
      return (
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <rect x="5" y="16" width="5" height="10" rx="1.5" fill="#E09F3E" stroke="#1C2541" strokeWidth="1.5" />
          <rect x="13.5" y="11" width="5" height="15" rx="1.5" fill="#2B59C3" stroke="#1C2541" strokeWidth="1.5" />
          <rect x="22" y="6" width="5" height="20" rx="1.5" fill="#C23B26" stroke="#1C2541" strokeWidth="1.5" />
        </svg>
      );
  }
}

export type FeatureSpotKind = 'plan' | 'cashflow' | 'csv' | 'reports' | 'bank' | 'analyst';

export function FeatureSpotIcon({ kind }: { kind: FeatureSpotKind }) {
  switch (kind) {
    case 'plan':
      return (
        <svg width="32" height="32" viewBox="0 0 36 36" fill="none" aria-hidden="true">
          <rect x="4" y="10" width="28" height="20" rx="4" fill="#FFFFFF" stroke="#1C2541" strokeWidth="1.8" />
          <path d="M5 13L18 22L31 13" stroke="#C23B26" strokeWidth="1.8" strokeLinejoin="round" />
          <circle cx="27" cy="9" r="4.5" fill="#E09F3E" stroke="#1C2541" strokeWidth="1.6" />
        </svg>
      );
    case 'cashflow':
      return (
        <svg width="32" height="32" viewBox="0 0 36 36" fill="none" aria-hidden="true">
          <rect x="4" y="7" width="28" height="23" rx="4" fill="#FFFFFF" stroke="#1C2541" strokeWidth="1.8" />
          <line x1="4" y1="14" x2="32" y2="14" stroke="#1C2541" strokeWidth="1.6" />
          <path
            d="M8 25L14 19L20 23L28 17"
            stroke="#2B59C3"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="28" cy="17" r="2.5" fill="#C23B26" />
        </svg>
      );
    case 'csv':
      return (
        <svg width="32" height="32" viewBox="0 0 36 36" fill="none" aria-hidden="true">
          <rect x="5" y="6" width="26" height="24" rx="4" fill="#FFFFFF" stroke="#1C2541" strokeWidth="1.8" />
          <line x1="10" y1="13" x2="20" y2="13" stroke="#1C2541" strokeWidth="1.8" strokeLinecap="round" />
          <line x1="10" y1="19" x2="18" y2="19" stroke="#1C2541" strokeWidth="1.8" strokeLinecap="round" />
          <line x1="10" y1="25" x2="19" y2="25" stroke="#1C2541" strokeWidth="1.8" strokeLinecap="round" />
          <path
            d="M23 18L25 20L29 15"
            stroke="#2F6B51"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'reports':
      return (
        <svg width="32" height="32" viewBox="0 0 36 36" fill="none" aria-hidden="true">
          <rect x="6" y="20" width="6" height="10" rx="2" fill="#E09F3E" stroke="#1C2541" strokeWidth="1.6" />
          <rect x="15" y="13" width="6" height="17" rx="2" fill="#2B59C3" stroke="#1C2541" strokeWidth="1.6" />
          <rect x="24" y="8" width="6" height="22" rx="2" fill="#C23B26" stroke="#1C2541" strokeWidth="1.6" />
        </svg>
      );
    case 'bank':
      return (
        <svg width="32" height="32" viewBox="0 0 36 36" fill="none" aria-hidden="true">
          <circle cx="13" cy="18" r="7" fill="#FFFFFF" stroke="#1C2541" strokeWidth="1.8" />
          <circle cx="23" cy="18" r="7" fill="#E8EFFC" stroke="#2B59C3" strokeWidth="1.8" />
          <circle cx="13" cy="18" r="2.2" fill="#1C2541" />
          <circle cx="23" cy="18" r="2.2" fill="#2B59C3" />
        </svg>
      );
    case 'analyst':
      return (
        <svg width="32" height="32" viewBox="0 0 36 36" fill="none" aria-hidden="true">
          <circle cx="16" cy="16" r="9" fill="#FFFFFF" stroke="#1C2541" strokeWidth="1.8" />
          <line x1="22.8" y1="22.8" x2="30" y2="30" stroke="#1C2541" strokeWidth="2.2" strokeLinecap="round" />
          <path
            d="M12.5 16L15 18.5L20 13.5"
            stroke="#2F6B51"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
  }
}

export function FitIcon({ kind }: { kind: 'yes' | 'no' }) {
  if (kind === 'yes') {
    return (
      <svg width="30" height="30" viewBox="0 0 34 34" fill="none" aria-hidden="true">
        <rect x="3" y="3" width="28" height="28" rx="6" fill="#E4F1EA" stroke="#1C2541" strokeWidth="1.6" />
        <path
          d="M10 17.5L15 22.5L24.5 12"
          stroke="#2F6B51"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg width="30" height="30" viewBox="0 0 34 34" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="28" height="28" rx="6" fill="#FCEAE6" stroke="#1C2541" strokeWidth="1.6" />
      <path d="M12 12L22 22M22 12L12 22" stroke="#C23B26" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function PosterCornerMotifs() {
  return (
    <>
      <svg
        className="mka-poster-corner mka-poster-corner--tl"
        width="54"
        height="54"
        viewBox="0 0 54 54"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="16" cy="16" r="10" fill="#E09F3E" />
        <path d="M32 10L44 22M44 10L32 22" stroke="#C23B26" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <svg
        className="mka-poster-corner mka-poster-corner--br"
        width="54"
        height="54"
        viewBox="0 0 54 54"
        fill="none"
        aria-hidden="true"
      >
        <rect x="8" y="22" width="18" height="18" rx="4" fill="#2B59C3" />
        <circle cx="38" cy="18" r="8" stroke="#E09F3E" strokeWidth="2.5" />
      </svg>
    </>
  );
}
