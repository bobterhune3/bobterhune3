const MLB_TEAM_IDS: Record<string, number> = {
  ANM: 108,
  AZB: 109,
  ATM: 144,
  BLN: 110,
  BSM: 111,
  CHB: 112,
  CLM: 114,
  DTB: 116,
  HSN: 117,
  KCM: 118,
  LAN: 119,
  MLG: 158,
  MNB: 142,
  NYB: 147,
  PHN: 143,
  PTN: 134,
  SDG: 135,
  SFN: 137,
  SEG: 136,
  SLB: 138,
  TBM: 139,
  TXG: 140,
  TOG: 141,
  WSG: 120,
};

export function mlbLogoUrl(abbr: string): string {
  const id = MLB_TEAM_IDS[abbr];
  if (!id) return "";
  return `https://www.mlbstatic.com/team-logos/team-cap-on-dark/${id}.svg`;
}
