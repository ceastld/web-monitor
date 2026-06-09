export interface SelectorDescription {
  selector: string;
  selector_type: "css" | "xpath";
  unique: boolean;
  matchCount: number;
  note: string | null;
}

export declare function countSelectorMatches(selector: string): number;
export declare function isUniqueSelector(selector: string, el: Element): boolean;
export declare function buildUniqueSelector(el: Element): string;
export declare function describeSelector(el: Element): SelectorDescription;
