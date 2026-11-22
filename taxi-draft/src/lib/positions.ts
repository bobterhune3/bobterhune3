export function posInfo(sort: string): { abbr: string; filters: string[] } {
  switch (sort) {
    case "1.0":
      return { abbr: "SP", filters: ["SP"] };
    case "1.2":
      return { abbr: "SW", filters: ["SW"] };
    case "1.3":
      return { abbr: "CL", filters: ["RP"] };
    case "1.4":
      return { abbr: "RP", filters: ["RP"] };
    case "1.6":
      return { abbr: "CARD", filters: [] };
    case "2.0":
      return { abbr: "C", filters: ["C"] };
    case "3.3":
      return { abbr: "1B", filters: ["1B"] };
    case "3.4":
      return { abbr: "2B", filters: ["2B"] };
    case "3.5":
      return { abbr: "3B", filters: ["3B"] };
    case "3.6":
      return { abbr: "SS", filters: ["SS"] };
    case "4.7":
      return { abbr: "LF", filters: ["OF"] };
    case "4.8":
      return { abbr: "CF", filters: ["OF"] };
    case "4.9":
      return { abbr: "RF", filters: ["OF"] };
    case "5.0":
      return { abbr: "DH", filters: [] };
    case "6.0":
    case "6.5":
      return { abbr: "CARD", filters: [] };
    default:
      return { abbr: sort || "—", filters: [] };
  }
}

export function headshotUrl(mlbid: string): string {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:silo:current.png,q_auto:best,f_auto,h_90,w_90/v1/people/${encodeURIComponent(mlbid)}/headshot/67/current`;
}

export const FILTERS = ["All", "SP", "SW", "RP", "C", "1B", "2B", "3B", "SS", "OF"] as const;

export function displayName(first: string, last: string): string {
  return first ? `${first} ${last}` : last;
}
