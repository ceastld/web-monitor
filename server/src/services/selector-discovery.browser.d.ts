export interface DiscoveredSelectorCandidate {
  selector: string;
  selector_type: string;
  label: string;
  tag: string;
  width: number;
  height: number;
  x: number;
  y: number;
}

export function discoverSelectors(): DiscoveredSelectorCandidate[];
